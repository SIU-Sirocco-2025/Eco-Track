<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Xác minh số đo và yêu cầu bổ sung

## Lịch sử và gói chứng cứ

Với Core có dịch vụ bản ghi, bật [lưu và so sánh quyết định theo phiên bản nguồn](DECISION-ARCHIVE.md).

Mở hồ sơ được giao để xem số đo nguồn, chứng cứ đã gửi, kết quả quét, việc trong Core, người xử lý và kết quả được ghi lại ở EcoTrack. Với bước cũ thiếu thời điểm, trang hiển thị **Chưa có thời điểm ghi nhận**. Hồ sơ đang chờ gửi lại hiển thị lịch thử và lý do nếu có.

Người được phân công có thể tải gói JSON sau khi chứng cứ nguồn đã được quét. Gói chứa bản nguồn và các chứng cứ tác vụ đã đối soát mà Core còn lưu. Gói v1 có phạm vi source-only và để kết luận trong danh mục là null. Gói v2 có phạm vi source-and-actions, kết luận phải khớp tệp tác vụ cuối. Mã SHA-256 kiểm tra nội dung từng tệp và danh mục gói.

```text
node scripts/verify-sirocco-evidence.js FILE [SHA256_TIN_CAY]
```

Nếu cần đối chiếu với bản đã nhận trước đó, lấy mã băm danh mục từ một kênh đáng tin cậy khác rồi truyền vào lệnh. Gói tự chứa mã băm giúp kiểm tính nhất quán. Người có thể sửa cả gói lẫn mã băm có thể tạo gói khác, nên mã này không xác thực danh tính nguồn phát hành.

Quy trình v2 giao số đo cho người xác minh. Người đó ghi lý do để xác minh, từ chối hoặc yêu cầu người được chỉ định bổ sung. Người bổ sung đọc yêu cầu và gửi nội dung trả lời; công việc quay lại người xác minh. Có thể lặp vòng bổ sung. Kết luận chỉ áp dụng cho phiên bản số đo lưu trong hồ sơ.

## Chuẩn bị

Giữ cấu hình kết nối và SSO theo README. Hai người xử lý dùng `sub` từ Identity và cần vai `ecotrack-reviewer` để vào giao diện. Core cấp quyền triển khai tạm cho operator; ứng dụng chạy hằng ngày không cần quyền này.

```text
node integrations/sirocco/cli.js install-review
```

Ghi definition ID nhận được vào `SIROCCO_REVIEW_DEFINITION_ID`, rồi giảm lại quyền credential về runtime theo hướng dẫn tích hợp. Đặt `SIROCCO_REVIEWER_ID`, `SIROCCO_SUPPLEMENTER_ID` và `SIROCCO_RULE_VERSION`. Hồ sơ v1 vẫn giữ definition cũ và dùng đường xử lý cũ.

### Xem ảnh hưởng trước khi chọn định nghĩa mới

Từ terminal backend EcoTrack, giữ `SIROCCO_REVIEW_DEFINITION_ID` bằng giá trị đang chạy và truyền ID dự kiến cho lệnh sau.

```text
node integrations/sirocco/cli.js workflow-impact DINH_NGHIA_MOI
```

Lệnh dùng credential runtime EcoTrack. Nó chỉ gọi API đọc định nghĩa và truy vấn MongoDB. `current` là ID trong terminal này, nên hãy đối chiếu với cấu hình backend đang chạy. Core và MongoDB được đọc nối tiếp. Nhóm đếm gồm hồ sơ v2 chờ gửi, chờ gửi lại, bị chặn và đang xử lý, trừ hồ sơ đã thay thế. `definitionId: null` cho biết nhóm thiếu ID hợp lệ. Đây là số đếm của MongoDB EcoTrack đang kết nối. API trả ID, process key và version. Mã băm BPMN nên lấy từ kết quả `install-review` đã lưu khi triển khai.

Lệnh yêu cầu hai định nghĩa thuộc cùng process key và client. `WORKFLOW_IMPACT_DEFINITION_UNAVAILABLE` nghĩa là ít nhất một định nghĩa chưa đọc được bằng credential hiện tại. Hãy kiểm lại ID, môi trường và quyền trước khi đổi cấu hình. Lệnh không ghi MongoDB, không cài BPMN và không áp dụng cấu hình.

Kiểm adapter với định nghĩa mới, lưu giá trị cũ, chạy xem trước ngay trước lúc đổi, rồi cập nhật `SIROCCO_REVIEW_DEFINITION_ID` trong cấu hình backend cho lần tạo hồ sơ kế tiếp. Nếu nhiều người vận hành có thể đổi cấu hình, điều phối để một người thực hiện và kiểm lại giá trị hiện hành trước khi lưu. Cấu hình vẫn đổi bằng quy trình triển khai hiện có, chưa có thao tác tự áp dụng từ báo cáo. Nếu cần quay lại, đặt biến về ID cũ cho hồ sơ mới sau khi kiểm còn quyền đọc. Các hồ sơ đã có giữ ID định nghĩa đã lưu.

Để tạo một việc có chủ đích từ số đo đã lưu:

```text
node integrations/sirocco/cli.js enqueue-review MONGO_HOUR_ID SENSOR_ID "Cần đối chiếu đơn vị và nguồn của số đo"
node integrations/sirocco/cli.js drain
```

## Tự đánh dấu số đo cần kiểm tra

Đặt biến `SIROCCO_REVIEW_RULE` bằng JSON, ví dụ dữ liệu mẫu:

```json
{"version":"demo-v1","parameter":"pm25","unit":"µg/m³","max":20,"maxAgeSeconds":3600}
```

Các mốc trong ví dụ chỉ minh họa cách tạo việc. Người phụ trách nghiệp vụ cần chọn mốc, đơn vị và phiên bản phù hợp trước khi dùng thật. Collector tạo yêu cầu sau khi lưu giờ quan trắc; `drain` gửi các yêu cầu tới Core. Quy tắc không tự kết luận an toàn môi trường. Bỏ biến này thì collector tiếp tục đường lưu số đo cũ.

## Gửi lại và dữ liệu thay đổi

Yêu cầu được ghi bền trước khi gọi Core. Khi chưa đối soát được kết quả, người đã gửi mở lại hồ sơ và chọn **Gửi lại yêu cầu đang chờ**. Nội dung gửi lại giữ nguyên; người ở bước sau chờ đối soát xong mới tiếp tục.

Dùng bộ lọc **Chờ đồng bộ kết quả** để tìm hồ sơ có yêu cầu đã lưu. Nếu Core đã hoàn tất quyết định, người đã gửi chọn **Đối soát kết quả đã gửi**. EcoTrack đọc nhật ký và lịch sử ở Core rồi ghi kết quả vào hồ sơ. Nút này không gửi thêm quyết định. Nếu Core chưa xác nhận, giữ yêu cầu đã lưu và dùng **Gửi lại yêu cầu đang chờ** khi cần. Nếu mất kết nối, trang chi tiết hiển thị bản số đo đã lưu tại EcoTrack cùng trạng thái gần nhất.

Để EcoTrack tự gửi hàng đợi và đối soát quyết định đã lưu, chạy tiến trình riêng với cấu hình MongoDB và credential runtime.

```text
node integrations/sirocco/cli.js worker
```

Tiến trình lấy hồ sơ đến hạn và giữ quyền xử lý tạm thời trong MongoDB. Quyết định được gửi lại với cùng mã thao tác đã lưu để Core nhận biết lần gửi trước. Khi vượt giới hạn thử lại, người đã gửi vẫn có thể mở hồ sơ và dùng thao tác gửi lại trên giao diện.

Khi Core trả HTTP 429, worker lấy thời gian chờ từ `Retry-After` hoặc từ số giây còn lại trong `X-RateLimit-Reset` của APISIX đi kèm Core. Worker chờ ít nhất khoảng đó và áp dụng backoff của hàng đợi. Các worker và lệnh `drain` cùng MongoDB và cùng địa chỉ gateway dùng chung thời hạn đã lưu. Yêu cầu đã bắt đầu trước lúc ghi thời hạn chờ vẫn có thể đến Core. Gateway mặc định áp hạn mức chung cho các ứng dụng cùng địa chỉ IP.

Worker dành ba giây cho lượt gửi quyết định từ giao diện trước khi xét tự đối soát. Nếu hai lượt vẫn đến Core cùng lúc, chúng dùng chung mã thao tác và nội dung đã lưu. Khi worker dừng đột ngột, worker khác có thể phải chờ quyền xử lý tạm thời hết hạn, tối đa năm phút cho lượt gửi hoặc mười phút cho lượt đối soát.

Lệnh `node integrations/sirocco/cli.js retry EVENT_ID` cho phép người vận hành mở lại lượt tự thử đã dừng. Lệnh giữ nội dung và mã thao tác cũ, đồng thời đặt lại ngân sách thử. Nếu gateway đang yêu cầu chờ thì worker vẫn tuân thủ thời hạn đã lưu.

Server so phiên bản nguồn và nhận ý định bằng một cập nhật có điều kiện trên bản ghi nguồn. Nếu nguồn đã đổi trước thời điểm nhận, hệ thống chặn quyết định đó. Nếu nguồn đổi sau thời điểm nhận, kết quả vẫn gắn phiên bản đã được tiếp nhận và mã băm chứng cứ của phiên bản đó. Số đo mới phải có hồ sơ phiên bản mới; không tự ghi đè chứng cứ hay quyết định cũ.

Lý do từng lần yêu cầu và trả lời được hiển thị trong mục **Nội dung trao đổi**. Mỗi nội dung được lưu thành chứng cứ JSON qua kho tệp Core, quét và đọc lại kiểm mã băm trước khi hoàn tất tác vụ. Giao diện nhận văn bản; chưa có nút đính kèm tệp riêng.

Nếu nguồn đổi trước lúc nhận ý định, hồ sơ chuyển sang **Nguồn đã thay đổi**. Người được giao xem lại, nhập lý do và xác nhận đang xử lý bản cũ. Ở bước bổ sung, thông báo được trả về người xác minh. Người xác minh chọn **Từ chối phiên bản nguồn đã thay đổi** để kết thúc hồ sơ cũ. Hệ thống giữ yêu cầu chưa gửi trong lịch sử và không cho dùng đường này để xác minh số đo.

Collector lưu dấu chờ đánh giá cùng bản ghi nguồn. Lần chạy sau tiếp tục quét các bản ghi chưa đánh giá; một bản ghi lỗi có lỗi riêng và không ngăn xử lý các bản ghi khác. Mỗi lượt quét tối đa 100 bản ghi, ưu tiên bản ghi chưa thử hoặc thử lâu nhất.

Mỗi source/revision có một cấu hình xử lý cố định. Đổi người được giao hoặc phiên bản quy tắc cho cùng revision đã có hồ sơ sẽ báo conflict; chưa tự chuyển hồ sơ cũ sang luật mới.

## Kiểm thực tế trong môi trường thử

`scripts/verify-sirocco-review.js` kiểm nguồn thay đổi, đóng hồ sơ cũ, tranh chấp quyết định, fencing, giữ reservation và quét lại sau gián đoạn trên MongoDB/Core thật. Chỉ chạy trên database local thử nghiệm `ecotrack_sirocco_tests`, đặt `SIROCCO_INTEGRATION_TEST=local-synthetic` và các biến kết nối/người xử lý/definition v2 nêu trên.

```text
node scripts/verify-sirocco-review.js --output NEW_RESULT.json
```

Phép thử thêm dữ liệu mô phỏng và các bản ghi nguồn lỗi để kiểm việc tiếp tục xử lý; không dùng database vận hành. Credential chỉ cần quyền runtime, không cần quản trị hoặc quyền deploy trong phép thử này.
