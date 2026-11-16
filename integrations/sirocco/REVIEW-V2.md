<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Xác minh số đo và yêu cầu bổ sung

Quy trình v2 giao số đo cho người xác minh. Người đó ghi lý do để xác minh, từ chối hoặc yêu cầu người được chỉ định bổ sung. Người bổ sung đọc yêu cầu và gửi nội dung trả lời; công việc quay lại người xác minh. Có thể lặp vòng bổ sung. Kết luận chỉ áp dụng cho phiên bản số đo lưu trong hồ sơ.

## Chuẩn bị

Giữ cấu hình kết nối và SSO theo README. Hai người xử lý dùng `sub` từ Identity và cần vai `ecotrack-reviewer` để vào giao diện. Core cấp quyền triển khai tạm cho operator; ứng dụng chạy hằng ngày không cần quyền này.

```text
node integrations/sirocco/cli.js install-review
```

Ghi definition ID nhận được vào `SIROCCO_REVIEW_DEFINITION_ID`, rồi giảm lại quyền credential về runtime theo hướng dẫn tích hợp. Đặt `SIROCCO_REVIEWER_ID`, `SIROCCO_SUPPLEMENTER_ID` và `SIROCCO_RULE_VERSION`. Hồ sơ v1 vẫn giữ definition cũ và dùng đường xử lý cũ.

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
