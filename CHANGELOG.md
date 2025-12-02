# CHANGELOG
## [v1.1.0](https://github.com/SIU-Sirocco-2025/Eco-Track/releases/tag/v1.1.0) - 2025-12-01

### Added
- Chuẩn hoá đầy đủ NGSI-LD / JSON-LD / SOSA / SSN cho AQI (context mở rộng: [config/ngsi-ld-context.js](config/ngsi-ld-context.js), file tĩnh: [public/context.jsonld](public/context.jsonld)).
- Bổ sung mô tả FIWARE AirQualityObserved & Prediction trong tài liệu ([README.md](README.md), [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).
- Script kiểm thử NGSI-LD tự động ([scripts/test-ngsi-ld.js](scripts/test-ngsi-ld.js)).
- Ví dụ dự đoán AQI ở định dạng NGSI-LD (hàm [`helpers.ngsiLdConverter.predictionToNGSILD`](helpers/ngsiLdConverter.js)).
- Mapping rõ ràng REST city keys ↔ NGSI-LD district keys trong API Docs ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).

### Changed
- Cập nhật phiên bản API hiển thị v1.1 trong docs ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).
- Đồng bộ hoá viết hoa chuẩn: NGSI-LD, JSON-LD, FIWARE, SOSA, SSN ([README.md](README.md), [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).
- Hoàn thiện mô tả NGSI-LD API trong README (loại bỏ heading trùng “🌐 API”) ([README.md](README.md)).
- Chuẩn hoá Accept header trong ví dụ NGSI-LD (`application/ld+json`) ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).
- Rà soát ID thực thể AirQualityObserved; (tuỳ chọn) chuẩn hoá định dạng có hoặc không timestamp (cần cập nhật nếu đổi) ([helpers/ngsiLdConverter.js](helpers/ngsiLdConverter.js), [controllers/api/aqiNgsiLd.controller.js](controllers/api/aqiNgsiLd.controller.js)).

### Fixed
- Sai đường dẫn context trong README (v1.jsonld → [public/context.jsonld](public/context.jsonld)).
- Không nhất quán cityKey/districtKey (quan1 vs district1) – bổ sung giải thích và ví dụ chuẩn ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).
- Chính tả “tương thác” → “tương tác” trong phần mô tả NGSI-LD ([README.md](README.md)).
- Đồng bộ repository metadata (repository/bugs/homepage) bỏ placeholder `your-org` ([package.json](package.json)).
- Thiếu nhãn Accept ở một số ví dụ NGSI-LD ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)).

### Deprecated (Informational)
- Định dạng entity ID không có timestamp sẽ sớm thay bằng dạng có epoch suffix cho truy vấn temporal chi tiết (xem kế hoạch nâng cấp trong v1.2.0).

---
## [v1.0.0](https://github.com/SIU-Sirocco-2025/Eco-Track/releases/tag/v1.0.0) - 2025-11-30

### Added
- Thu thập dữ liệu AQI từ OpenAQ theo giờ ([scripts/fetch-openaq-hours.js](scripts/fetch-openaq-hours.js), [models/hcmcAirHour.model.js](models/hcmcAirHour.model.js), [models/hcmcAirindex.model.js](models/hcmcAirindex.model.js))
- Dịch vụ đồng bộ dữ liệu AQI 72h và realtime khi khởi động server ([services/aqiSyncService.js](services/aqiSyncService.js), gọi từ [index.js](index.js))
- API dự đoán AQI 24h cho từng quận/huyện bằng Python LSTM ([controllers/api/prediction.controller.js](controllers/api/prediction.controller.js), [helpers/pythonRunner.js](helpers/pythonRunner.js), [predict_from_json.py](predict_from_json.py))
- Trang Dashboard Admin: tổng quan AQI, thời tiết, cảnh báo, biểu đồ, export CSV/JSON ([views/admin/pages/dashboard/index.pug](views/admin/pages/dashboard/index.pug), [controllers/admin/aqi.controller.js](controllers/admin/aqi.controller.js), [controllers/admin/weather.controller.js](controllers/admin/weather.controller.js))
- Trang Client: bản đồ AQI, heatmap, hero status, khuyến nghị theo mức AQI, docs API ([views/client/pages/home/index.pug](views/client/pages/home/index.pug), [public/client/js/script.js](public/client/js/script.js), [public/client/js/forecast.js](public/client/js/forecast.js), [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug))
- Hệ thống ticket phản hồi người dùng (client + admin) với email thông báo và cập nhật trạng thái/độ ưu tiên ([models/ticket.model.js](models/ticket.model.js), [controllers/client/ticket.controller.js](controllers/client/ticket.controller.js), [controllers/admin/ticket.controller.js](controllers/admin/ticket.controller.js), [views/admin/pages/ticket/index.pug](views/admin/pages/ticket/index.pug))
- Quản lý tài khoản người dùng (đăng ký/đăng nhập/đổi mật khẩu, lấy API key, cài đặt) ([views/client/pages/auth/*](views/client/pages/auth), [controllers/admin/settings.controller.js](controllers/admin/settings.controller.js), [views/admin/pages/settings/index.pug](views/admin/pages/settings/index.pug))
- Seed dữ liệu mẫu 72h phục vụ prediction ([scripts/seed-72h-data.js](scripts/seed-72h-data.js)) và reset dữ liệu quận ([scripts/reset-district-data.js](scripts/reset-district-data.js))
- Tài liệu API đầy đủ với ví dụ request/response ([views/client/pages/docs/index.pug](views/client/pages/docs/index.pug), [public/client/css/docs.css](public/client/css/docs.css))
- Cấu hình TinyMCE cho client/admin ([public/client/js/tinymce-config.js](public/client/js/tinymce-config.js), [public/admin/js/tinymce-config.js](public/admin/js/tinymce-config.js))

### Changed
- Chuẩn hoá tính AQI từ các pollutants (PM2.5, PM10, O3, NO2, SO2, CO) và tổng hợp AQI chính ([services/aqiSyncService.js](services/aqiSyncService.js), [scripts/sync-openaq-to-districts.js](scripts/sync-openaq-to-districts.js))
- Cải thiện giao diện trang chủ: hero động, khuyến nghị theo AQI, legend, statusbar, hiệu ứng UI ([public/client/css/style.css](public/client/css/style.css), [views/client/pages/home/index.pug](views/client/pages/home/index.pug))
- Tối ưu hoá controller client/api: thống kê, xu hướng, lịch sử, lọc dữ liệu, export ([controllers/client/aqi.controller.js](controllers/client/aqi.controller.js), [controllers/admin/aqi.controller.js](controllers/admin/aqi.controller.js))
- Bổ sung bản đồ quận ↔ model đầy đủ cho TP.HCM ([models/*](models), map trong controllers/scripts)
- Bổ sung header giấy phép GPL cho các file mã nguồn

### Fixed
- Sửa lỗi seed 72h không đồng bộ thời gian và phạm vi AQI ([scripts/seed-72h-data.js](scripts/seed-72h-data.js))
- Sửa phân loại nhãn AQI hiển thị chưa thống nhất (client/forecast/script)
- Khắc phục chồng lấn cron và trạng thái đang chạy khi gọi API hoặc fetch dữ liệu ([controllers/api/prediction.controller.js](controllers/api/prediction.controller.js), [scripts/fetch-openaq-hours.js](scripts/fetch-openaq-hours.js))
- Sửa một số lỗi giao diện và hiển thị thời gian cập nhật (client/admin)

---

Release Links:
- Guide: [RELEASE_GUIDE.md](RELEASE_GUIDE.md)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- License: [LICENSE](LICENSE)