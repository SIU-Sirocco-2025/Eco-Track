<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Lưu lịch sử quyết định tại Sirocco Core

Khi một nguồn quan trắc được hiệu chỉnh, mỗi phiên bản nguồn có case và quyết định riêng. Core nhóm các quyết định theo `sourceKey`. Người vận hành tra các phiên bản Core đã nhận, sau đó đọc và kiểm tệp nguồn cùng các hành động mà không cần kết nối MongoDB của EcoTrack. UI EcoTrack vẫn kiểm quyền người dùng bằng hồ sơ được giao trước khi cho tải phiên bản tương ứng.

## Cấu hình

1. Quản trị Core cấp thêm `records.schema,records.read,records.write` cho client EcoTrack. Chạy `node integrations/sirocco/cli.js archive-install` với token của đúng client. Lệnh công bố schema cho `observation-decisions`.
2. Rút quyền `records.schema` sau khi cài. Worker cần `records.read,records.write` ngoài quyền vận hành cũ. Bật `SIROCCO_REVIEW_ARCHIVE=true` cho tiến trình tạo hồ sơ v2 và worker, rồi chạy `cli.js check` để kiểm thêm dịch vụ bản ghi. Luồng đặt việc thủ công và luồng tự tạo từ quy tắc dùng cùng tùy chọn. Chính sách lưu lịch sử của hồ sơ được chốt khi tạo và giữ nguyên khi phát lại cùng nguồn.
3. Trên hồ sơ đã chốt, trang chi tiết phân biệt đang chờ, đã xác nhận phiên bản và cần xử lý. Người vận hành xem mã bằng `cli.js status CASE_ID` và dùng `archive-retry CASE_ID` sau khi sửa nguyên nhân. Dùng `archive-drain` để chạy một lượt gửi có giới hạn.

Quyết định nghiệp vụ và ý định lưu lịch sử ghi cùng lần cập nhật MongoDB sau khi xác nhận workflow. Khi lưu lịch sử bị gián đoạn, quyết định đã lưu vẫn xuất hiện ở EcoTrack. Worker lưu phiên bản kỳ vọng trước khi gửi và gửi lại đúng body, đúng mã sau khi mất phản hồi. Mã 412 cho biết một lệnh khác đã ghi phiên bản tiếp theo. Worker có thể đọc phiên bản mới rồi gửi lại ý định cũ với điều kiện mới.

## Đọc mà không cần MongoDB

Với credential của EcoTrack có `records.read`, tra lịch sử đã ghi tại Core. Với `objects.read`, có thể xuất và kiểm cả tệp.

```text
node integrations/sirocco/cli.js archive-history SOURCE_KEY
node integrations/sirocco/cli.js archive-export SOURCE_KEY CORE_VERSION
node integrations/sirocco/cli.js archive-compare SOURCE_KEY OLD_VERSION NEW_VERSION
```

Mỗi lần đọc lịch sử trả đến 20 phiên bản đã commit. Dùng số phiên bản Core để chọn hồ sơ. Số này thể hiện thứ tự lưu, còn hash `sourceRevision` nhận diện nội dung đo. Danh sách Core có thể thiếu hồ sơ đang chờ ở EcoTrack. Kiểm trạng thái tại EcoTrack khi cần xác nhận toàn bộ hồ sơ của kỳ đã được lưu.

Kết quả export gồm bản ghi Core và gói chứng cứ JSON. Core kiểm tham chiếu journal workflow và các biên nhận tệp sạch cùng client khi ghi. EcoTrack đọc lại bytes, kiểm hash, liên kết với phiên bản nguồn và đối chiếu task đã tạo quyết định. Thông tin như phiên bản quy tắc được EcoTrack báo cáo trong bản ghi. Quyền thao tác của người dùng vẫn do EcoTrack áp dụng. Gói hiện giới hạn một tệp nguồn và tối đa 31 tệp hành động.
