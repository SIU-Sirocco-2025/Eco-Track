<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# EcoTrack 2025 kết nối Sirocco Core

Adapter đọc bản ghi `HCMCAirHour` trong MongoDB của EcoTrack, đưa snapshot qua kho tệp và ClamAV của Core, tạo workflow xác minh nguồn rồi lưu kết quả trở lại collection `sirocco_outbox`. Các thao tác đi qua API Gateway bằng credential của EcoTrack.

Với cài đặt mới, làm theo [quy trình xác minh và bổ sung chứng cứ](REVIEW-V2.md) và dùng `install-review`. Manifest mô tả gói BPMN của quy trình này. Lệnh `check` kiểm nối Core và ba dịch vụ EcoTrack dùng. Core v2 có hỗ trợ kiểm riêng trả `readiness: "per-service"`. Phiên bản v2 cũ dùng phép kiểm gộp. SSO và dữ liệu MongoDB cần kiểm qua luồng ứng dụng.

Người được giao việc có thể xác minh qua trang `/sirocco/review` khi quản trị bật SSO. Người vận hành dùng `enqueue-review` cho quy trình mới và `enqueue` cho quy trình v1 mô tả bên dưới.

## SSO và màn hình xác minh

Tạo một OpenID Connect client riêng trong realm của Core. Bật Client authentication, Standard flow và bắt buộc PKCE S256. Đăng ký redirect URI chính xác `<origin EcoTrack>/sirocco/review/callback`. Tắt Direct access grants cho client này.

Dùng mẫu `oidc-client.json` cùng lệnh `scripts/identity-client.mjs` của Core để validate, preview và apply. Manifest cấp client role `ecotrack-reviewer` và mapper chỉ xuất role thuộc client đó vào claim `ecotrack_roles`. Trong Keycloak, quản trị gán client role này cho người xác minh. Đặt `SIROCCO_REVIEWER_ID` bằng Keycloak user ID (claim `sub`) khi enqueue bản ghi dành cho họ. Cấu hình role mapper bằng tay cần chọn User Client Role và đúng clientId.

EcoTrack đọc `SIROCCO_OIDC_ISSUER`, `SIROCCO_OIDC_CLIENT_ID`, `SIROCCO_OIDC_CLIENT_SECRET`, `SIROCCO_REVIEW_ORIGIN` và `SIROCCO_REVIEW_SESSION_SECRET` từ môi trường server. Session secret cần ít nhất 32 ký tự ngẫu nhiên. Sử dụng HTTPS ngoài máy local. Nếu chấm dứt TLS tại reverse proxy, cấu hình Express trust proxy cho đúng proxy trước khi mở route HTTPS.

Phiên xác minh độc lập với phiên đăng nhập EcoTrack hiện có. Session được lưu trong collection MongoDB `sirocco_review_sessions` với TTL, dùng chung giữa các process có cùng database, origin và session secret. Quyền xác minh kéo dài tối đa 5 phút, hoặc ngắn hơn nếu ID token hết hạn trước. Thời hạn này được kiểm ở backend trên mọi lần đọc và ghi, kể cả khi MongoDB chưa dọn bản ghi TTL. Đăng xuất EcoTrack xóa phiên xác minh cục bộ trong MongoDB. Quyền Keycloak được đọc lại ở lần bắt đầu phiên mới. Khi thu hồi role, phiên hiện hữu có thể còn hiệu lực đến hết 5 phút, sau đó lần đăng nhập mới phải được cấp role lại để tiếp tục.

Khởi động web EcoTrack bằng cấu hình server đã điền đầy đủ.

```text
node --env-file=/private/ecotrack.env index.js
```

Mở `<SIROCCO_REVIEW_ORIGIN>/sirocco/review`, chọn đăng nhập và dùng tài khoản Keycloak được cấp client role. Danh sách chỉ hiện công việc có reviewer khớp user ID. Người vận hành cần enqueue/drain để một bản ghi trở thành active trước khi reviewer có thể xem và hoàn tất trên web.

## Chuẩn bị

1. Node.js 22.16 trở lên và `npm ci --ignore-scripts` trong repo EcoTrack.
2. MongoDB của EcoTrack có collection `hcmc_air_hours`. Dùng database riêng khi diễn tập.
3. Core chạy connector v2 ở chế độ `scoped`, gateway và dependency sẵn sàng.
4. Quản trị Core cấp client `ecotrack-2025` với các scope trong `manifest.json`, cộng `workflow.deploy` ở bước cài đặt. Credential chỉ giữ trên backend.
5. Người vận hành chọn định danh reviewer. CLI yêu cầu actor hoàn tất trùng reviewer; đây là actor do ứng dụng khai báo, chưa có phiên SSO chứng minh danh tính.

Quy trình cấp client và kiểm hợp đồng dùng [hướng dẫn Core](https://github.com/SIU-Sirocco-2026/sirocco-core/blob/main/docs/CONNECT-AN-APPLICATION.md) trong phiên bản tích hợp đã bàn giao. Đường dẫn trên main có thể chưa có khi nhánh đang phát triển.

Tạo file cấu hình riêng ngoài Git, dùng mẫu `server.env.example`. Đặt quyền đọc chỉ cho tài khoản vận hành. Các lệnh dưới đây chạy từ root EcoTrack; thay `/private/ecotrack.env` bằng đường dẫn thật. Node đọc token từ môi trường, không đặt giá trị token vào tham số lệnh.

```text
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js check
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js install
```

`install` trả về `definitionId`. Lưu giá trị đó vào `SIROCCO_DEFINITION_ID` của file cấu hình. Cài lại cùng BPMN trả về cùng definition; sửa BPMN tạo deployment theo hash mới.

Quản trị Core giảm quyền sau cài đặt:

```text
node scripts/connector-client.mjs restrict ecotrack-2025 workflow.read,workflow.start,workflow.complete,objects.read,objects.write,objects.promote
```

Lệnh trên chạy trong môi trường operator Core có `DATABASE_URL`. Nó giữ token và từ chối tăng quyền hoặc bật lại client đã disable. Adapter không có quyền tự cấp lại credential.

Từ checkout Core đã build, kiểm gói EcoTrack:

```text
node scripts/connector-check.mjs /path/to/Eco-Track/integrations/sirocco/manifest.json
node --env-file=/private/ecotrack.env scripts/connector-check.mjs /path/to/Eco-Track/integrations/sirocco/manifest.json --live
```

## Dữ liệu đầu vào

Collector `scripts/fetch-openaq-hours.js` giữ trường `sourceRecords` bên cạnh `raw` và `measurements`. Mỗi phần tử gồm `sensorId`, `provider: openaq`, `mode`, `collectedAt`, URL thực tế `sourceEndpoint` và bản ghi `raw` của nguồn. `raw.parameter` chứa tên/đơn vị; `raw.period` chứa cửa sổ giờ với múi giờ; `raw.value` là số hữu hạn không âm. Với observed/replay, adapter này chỉ nhận endpoint OpenAQ chính thức khớp sensor; API mirror cần adapter/kiểm chứng riêng. Cửa sổ chưa kết thúc lúc thu bị từ chối.

Adapter hiện chỉ nhận cửa sổ đúng một giờ, trùng `from/to` của document. Nó lưu `ageAtCollectionSeconds` để người xác minh biết tuổi số đo lúc thu; chưa tự quyết định cảnh báo từ độ tươi hoặc giá trị PM2.5. Có nhiều sensor cùng parameter thì mỗi sensor giữ lineage riêng.

| Chế độ | Ý nghĩa |
| --- | --- |
| `observed` | Collector đã lấy từ API OpenAQ; không có nghĩa cảm biến đã được hiệu chuẩn hoặc dữ liệu chắc chắn đúng |
| `replay` | Phát lại dữ liệu nguồn, giữ thời gian và provenance của dữ liệu |
| `synthetic` | Dữ liệu tạo để kiểm thử; snapshot không cung cấp URL sensor thật |

Document cũ thiếu `sourceRecords` bị từ chối bằng `SOURCE_PROVENANCE_MISSING`. Cần lấy lại dữ liệu nguồn kèm sensor ID hoặc xử lý di trú có bằng chứng; không suy ra ID từ AQI quận. AQI quận/thời tiết giả lập của chức năng cũ không được dùng làm số đo quan trắc trong adapter này.

## Gửi một giờ được chọn và nhận kết quả

Lấy `_id` của một document có provenance bằng công cụ quản trị EcoTrack được cấp quyền, rồi chạy:

```text
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js enqueue MONGO_HOUR_ID
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js drain
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js status EVENT_ID
```

`enqueue` lưu một intent cho mỗi sensor/revision trong giờ đó, chưa gửi sang Core. Kết quả có `id` dùng làm `EVENT_ID`. `drain` xử lý tối đa 20 intent đến hạn; có thể gọi lại hoặc lập lịch bằng cơ chế vận hành của app. Lần lượt upload → promote/quét → đọc lại bytes → start workflow. `active` nghĩa workflow đang đợi xác minh; không có nghĩa số đo đã được chấp nhận.

Khi người vận hành đã xem snapshot và nguồn, ghi quyết định:

```text
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js complete EVENT_ID REVIEWER_ID verified
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js reconcile EVENT_ID
```

Thay `verified` bằng `rejected` nếu không chấp nhận nguồn. Lệnh ghi intent hoàn tất trước khi gửi, kiểm journal và lịch sử task/process rồi lưu kết quả vào `sirocco_outbox`. Nó không sửa giá trị số đo gốc, không kết luận an toàn sức khỏe. Gửi lại cùng quyết định là thao tác có thể đối soát; đổi quyết định của cùng completion intent bị từ chối.

## Retry, revision và quyền

Lệnh `metrics` giúp người vận hành xem số lượng theo trạng thái, thời điểm intent cũ nhất, tổng số lần thử và mã lỗi của backlog.

```text
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js metrics
```

Phân biệt `active` đang chờ người xác minh với `retry` chờ gửi lại và `blocked` cần kiểm nguyên nhân. `metrics` đọc MongoDB, không gửi thao tác sang Core.

Khóa nguồn gồm provider, mode, sensor, parameter và cửa sổ đo. Revision là hash nội dung nguồn. Thu lại cùng dữ liệu với `collectedAt` mới không tạo thêm intent; snapshot đầu tiên đã lưu được giữ nguyên. Giá trị hoặc raw content thay đổi tạo revision mới, task riêng và cùng `sourceKey`. Adapter không tự hủy hoặc thay thế quyết định về revision cũ. Đổi definition/reviewer cho intent đã tồn tại trả `OUTBOX_CONFIGURATION_CONFLICT` để người vận hành xử lý.

Các bước có operation ID ổn định dài dưới 100 ký tự: `<event-hash>_upload`, `_promote`, `_start`, `_complete`. MongoDB lưu tiến độ `steps.uploaded`, receipt và process ID. Lease 5 phút dùng thao tác Mongo nguyên tử và fencing ID; hai worker không được ghi đè tiến độ của nhau. Nếu worker chết, chờ lease hết hạn rồi chạy lại; operation ID giữ nguyên kể cả khi một lời gọi cũ chưa kết thúc.

Timeout, 429 hoặc 5xx chuyển sang `retry`, backoff tối đa 15 phút, tối đa 10 lần tự động. Scanner từ chối tệp, lỗi quyền, input hoặc conflict chuyển `blocked`; không tạo workflow khi snapshot chưa qua kiểm dịch. Sau khi xử lý nguyên nhân, operator có thể dùng:

```text
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js retry EVENT_ID
node --env-file=/private/ecotrack.env integrations/sirocco/cli.js drain
```

Lệnh `retry` giữ payload/ID cũ, không vượt quyền Core hoặc đổi nội dung tệp. Với lỗi hoàn tất task, gọi lại `complete` cùng quyết định để replay/đối soát, hoặc `reconcile` nếu journal đã applied. Khi dữ liệu nguồn thay đổi, tạo revision mới thay vì sửa intent đã gửi.

## Kiểm thử và giới hạn

```text
node --test test/sirocco-source.test.js
node --env-file=/private/integration-test.env scripts/verify-sirocco-integration.js --output /private/new-result.json
```

Để kiểm token OIDC lỗi bằng provider fixture local và MongoDB riêng, đặt `SIROCCO_OIDC_TEST_DATABASE_URL=mongodb://127.0.0.1:27028/ecotrack_oidc_tests`, rồi chạy `node --test test/sirocco-oidc.test.js`. Suite này kiểm chữ ký, issuer, audience, nonce, token hết hạn, state sai và callback đã dùng. Phép kiểm Chrome với Keycloak thật cần cấu hình/tài khoản diễn tập riêng.

Phép thử thứ hai yêu cầu `SIROCCO_INTEGRATION_TEST=local-synthetic`, MongoDB local có tên chính xác `ecotrack_sirocco_tests`, Core local, `SIROCCO_DEFINITION_ID` và token thứ hai `CORE_OTHER_TOKEN` thuộc client `ecotrack-probe` với quyền runtime tương đương. Nó tạo dữ liệu synthetic trong model EcoTrack, gọi gateway/Core thật, kiểm lease/duplicate, cách ly process/task/file, thiếu scope deploy, operation conflict, revision, checksum và kết quả quay về Mongo.

Phép thử tiêm lỗi sau khi Core đã tạo process nhưng trước khi adapter lưu process ID; lần retry chạy bằng process Node mới. Đây là phép thử mất phản hồi ở ranh giới adapter, không phải thử cắt điện hay restart toàn bộ Core. Nó chưa kiểm nguồn OpenAQ live, giao diện, SSO, hiệu năng tải lớn hoặc restore cặp Mongo/Core. Giữ các mốc đó trong kế hoạch phát triển tiếp theo.
