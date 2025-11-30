# Release Guide – Eco-Track

Tài liệu hướng dẫn phát hành phiên bản mới theo chuẩn mã nguồn mở (SemVer). Áp dụng cho phát hành v1.0.0 và các phiên bản sau.

## 1) Chuẩn bị trước khi phát hành
- Cập nhật tài liệu:
  - CHANGELOG: xem [CHANGELOG.md](CHANGELOG.md)
  - README: xem [README.md](README.md)
  - Hướng dẫn đóng góp: xem [CONTRIBUTING.md](CONTRIBUTING.md)
- Kiểm tra giấy phép: [LICENSE](LICENSE) (GPL v3.0)
- Đảm bảo yêu cầu hệ thống trong [README.md](README.md) được đáp ứng (Node, MongoDB, Python).

## 2) Kiểm thử trong Visual Studio Code
- Chạy ứng dụng cục bộ:
  - `npm run dev` hoặc `npm start` (xem [package.json](package.json))
- Kiểm thử API và giao diện:
  - Client: bản đồ AQI, dashboard, docs API
  - Admin: thống kê AQI/Thời tiết, export CSV/JSON
- Cron/scripts dữ liệu:
  - `node scripts/fetch-and-save.js`
  - `node scripts/fetch-openaq-hours.js`
- Kiểm tra phụ thuộc Python cho mô-đun dự đoán:
  - [`helpers.checkPythonDeps.ensurePythonDependencies`](helpers/checkPythonDeps.js)
  - Chạy thử `predict_from_json.py` qua [`helpers.pythonRunner.runPythonScriptWithStdin`](helpers/pythonRunner.js)

## 3) Cập nhật phiên bản & CHANGELOG
- Theo SemVer: MAJOR.MINOR.PATCH
- Tăng phiên bản trong [package.json](package.json)
- Hoàn thiện mục Added/Changed/Fixed trong [CHANGELOG.md](CHANGELOG.md) cho bản phát hành.

## 4) Quy trình phát hành (Git)
1. Đảm bảo tất cả kiểm thử thủ công đã pass
2. Commit cuối: `chore: release vX.Y.Z`
3. Tag phiên bản:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
4. Tạo GitHub Release:
   - Tiêu đề: `Eco-Track vX.Y.Z`
   - Nội dung: đính kèm [CHANGELOG.md](CHANGELOG.md)
   - Tùy chọn: đính kèm file export mẫu nếu cần

## 5) Checklist chức năng trọng yếu
- Thu thập AQI AirVisual: [scripts/fetch-and-save.js](scripts/fetch-and-save.js)
- Đồng bộ OpenAQ theo giờ: [scripts/fetch-openaq-hours.js](scripts/fetch-openaq-hours.js)
- Chuẩn hoá/tổng hợp AQI: [services/aqiSyncService.js](services/aqiSyncService.js)
- API dự đoán 24h: [controllers/api/prediction.controller.js](controllers/api/prediction.controller.js), [predict_from_json.py](predict_from_json.py)
- Dashboard Admin: [views/admin/pages/dashboard](views/admin/pages/dashboard)
- Docs API: [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug), [public/client/css/docs.css](public/client/css/docs.css)

## 6) Deploy
- Khuyến nghị tự host trên máy chủ riêng hoặc sử dụng các dịch vụ cloud trả phí (AWS, Azure, GCP, DigitalOcean, v.v.) để đảm bảo hiệu năng và bảo mật cho mô hình AI.
- Sử dụng PM2 để quản lý tiến trình Node.js:
  - Xem [PM2_GUIDE.md](PM2_GUIDE.md)
  - Start/Restart/Logs theo hướng dẫn
- Môi trường:
  - Kiểm tra `.env`: xem mục “⚙️ Biến Môi Trường (.env)” trong [README.md](README.md)

## 7) Sau phát hành
- Cập nhật liên kết Demo/Docs (nếu có) trong [README.md](README.md)
- Mở milestone mới cho phiên bản tiếp theo
- Tạo issue theo phản hồi người dùng (Ticket hệ thống: client/admin)

---