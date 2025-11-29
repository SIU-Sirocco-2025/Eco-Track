# CHANGELOG

## [1.0.0] - 2025-11-29
### Added
- Thu thập dữ liệu AQI từ AirVisual (`scripts/fetch-and-save.js`) và OpenAQ theo giờ (`scripts/fetch-openaq-hours.js`, `models/hcmcAirHour.model.js`, `models/hcmcAirindex.model.js`)
- Dịch vụ đồng bộ 72h và realtime khi khởi động server (`services/aqiSyncService.js`, gọi từ `index.js`)
- API dự đoán AQI 24h cho từng quận/huyện bằng Python LSTM (`controllers/api/prediction.controller.js`, `helpers/pythonRunner.js`, `predict_from_json.py`)
- Trang Dashboard Admin: tổng quan AQI, thời tiết, cảnh báo, biểu đồ, export CSV/JSON (`views/admin/pages/dashboard`, `controllers/admin/aqi.controller.js`, `controllers/admin/weather.controller.js`)
- Trang Client: bản đồ AQI, heatmap, hero status, khuyến nghị theo mức AQI, docs API (`views/client/pages/home`, `public/client/js/script.js`, `public/client/js/forecast.js`, `views/client/pages/docs`)
- Hệ thống ticket phản hồi người dùng (client + admin) với email thông báo và cập nhật trạng thái/độ ưu tiên (`models/ticket.model.js`, `controllers/client/ticket.controller.js`, `controllers/admin/ticket.controller.js`, `views/admin/pages/ticket`)
- Quản lý tài khoản người dùng (đăng ký/đăng nhập/đổi mật khẩu, lấy API key, cài đặt) (`views/client/pages/auth/*`, `controllers/admin/settings.controller.js`, `views/admin/pages/settings`)
- Seed dữ liệu mẫu 72h phục vụ prediction (`scripts/seed-72h-data.js`) và reset dữ liệu quận (`scripts/reset-district-data.js`)
- Tài liệu API đầy đủ với ví dụ request/response (`views/client/pages/docs/index.pug`, `public/client/css/docs.css`)
- Cấu hình TinyMCE cho client/admin (`public/client/js/tinymce-config.js`, `public/admin/js/tinymce-config.js`)

### Changed
- Chuẩn hoá tính AQI từ các pollutants (PM2.5, PM10, O3, NO2, SO2, CO) và tổng hợp AQI chính (`services/aqiSyncService.js`, `scripts/sync-openaq-to-districts.js`)
- Cải thiện giao diện trang chủ: hero động, khuyến nghị theo AQI, legend, statusbar, hiệu ứng UI (`public/client/css/style.css`, `views/client/pages/home/index.pug`)
- Tối ưu hoá controller client/api: thống kê, xu hướng, lịch sử, lọc dữ liệu, export (`controllers/client/aqi.controller.js`, `controllers/admin/aqi.controller.js`)
- Bổ sung bản đồ quận ↔ model đầy đủ cho TP.HCM (`models/*`, map trong controllers/scripts)

### Fixed
- Sửa lỗi seed 72h không đồng bộ thời gian và phạm vi AQI (`scripts/seed-72h-data.js`)
- Sửa phân loại nhãn AQI hiển thị chưa thống nhất (client/forecast/script)
- Khắc phục chồng lấn cron và trạng thái đang chạy khi gọi API hoặc fetch dữ liệu (`controllers/api/prediction.controller.js`, `scripts/fetch-and-save.js`)
- Sửa một số lỗi giao diện và hiển thị thời gian cập nhật (client/admin)

---