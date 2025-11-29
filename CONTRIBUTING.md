# Hướng dẫn đóng góp cho Eco-Track

Cảm ơn bạn đã quan tâm đến Eco-Track! Vui lòng tuân thủ các nguyên tắc sau để đảm bảo quy trình đóng góp rõ ràng, minh bạch và phù hợp tiêu chí OLP.

## 1) Điều kiện tiên quyết
- Đọc tổng quan dự án tại [README.md](README.md).
- Nắm quy trình phát hành tại [RELEASE_GUIDE.md](RELEASE_GUIDE.md) và cập nhật lịch sử tại [CHANGELOG.md](CHANGELOG.md).
- Tuân thủ giấy phép GPL v3.0: xem [LICENSE](LICENSE).

## 2) Quy trình đóng góp (Pull Request)
1. Fork repository về tài khoản của bạn.
2. Tạo branch theo chuẩn:
   - Tính năng: `feat/<ten-tinh-nang>`
   - Sửa lỗi: `fix/<mo-ta-loi>`
   - Tài liệu: `docs/<chude>`
   - Tối ưu/refactor: `refactor/<pham-vi>`
3. Commit theo Conventional Commits:
   - `feat: mô tả ngắn`
   - `fix: mô tả ngắn`
   - `docs: mô tả ngắn`
   - `refactor: mô tả ngắn`
   - `chore: mô tả ngắn`
4. Viết mô tả PR rõ ràng:
   - Mục tiêu thay đổi
   - Phạm vi ảnh hưởng (controllers, models, views, scripts,…)
   - Cách chạy để kiểm tra
   - Ảnh/chụp màn hình nếu là UI
5. Cập nhật [CHANGELOG.md](CHANGELOG.md) cho mục phiên bản đang phát triển (phần `Added/Changed/Fixed`).
6. Tạo PR lên nhánh `main`.

## 3) Yêu cầu kỹ thuật tối thiểu
- Node.js và npm/yarn tương thích với hướng dẫn tại [README.md](README.md).
- Biến môi trường cấu hình theo mục “⚙️ Biến Môi Trường (.env)” trong [README.md](README.md).
- Chạy thử cục bộ:
  - `npm run dev` hoặc `npm start` (xem [package.json](package.json)).
  - Tùy chọn: các cron scripts
    - `node scripts/fetch-and-save.js`
    - `node scripts/fetch-openaq-hours.js`
- Python dependencies (cho mô-đun dự đoán):
  - Kiểm tra/cài đặt qua [`helpers.checkPythonDeps.ensurePythonDependencies`](helpers/checkPythonDeps.js).

## 4) Quy tắc chất lượng mã
- Tuân thủ cấu trúc thư mục trong [README.md](README.md) (config, controllers, models, scripts, views, public,…).
- Không hard-code thông tin nhạy cảm; dùng `.env`.
- Đối với API/dịch vụ:
  - Giữ nguyên chuẩn hóa AQI, tái sử dụng các hàm trong [`services.aqiSyncService`](services/aqiSyncService.js) và scripts liên quan (`scripts/sync-openaq-to-districts.js`, `scripts/fetch-openaq-hours.js`).
- Đối với UI:
  - Sử dụng Pug, Bootstrap 5, tôn trọng style hiện có trong `public/client/css` và cấu hình TinyMCE ở `public/client/js/tinymce-config.js`, `public/admin/js/tinymce-config.js`.
- Đối với ML/Prediction:
  - Gọi Python thông qua [`helpers.pythonRunner.runPythonScriptWithStdin`](helpers/pythonRunner.js) và tuân theo input/output JSON của [`predict_from_json.py`](predict_from_json.py).

## 5) Chuẩn commit & đặt tên
- Tiền tố theo loại thay đổi: `feat`, `fix`, `docs`, `refactor`, `chore`.
- Mô tả ngắn gọn, dùng câu chủ động, tiếng Việt không dấu hoặc tiếng Anh.
- Ví dụ:
  - `feat: them API du doan AQI 24h cho quan1`
  - `fix: xu ly chong lan cron trong fetch-openaq-hours`

## 6) Tiêu chí đánh giá PR
- Bám sát mục tiêu dự án và tiêu chí OLP (mã nguồn mở, dễ đọc, có tài liệu).
- Không phá vỡ API/route hiện có trừ khi có lý do và tài liệu rõ ràng trong [README.md](README.md) và [CHANGELOG.md](CHANGELOG.md).
- Có hướng dẫn kiểm thử thủ công (bước chạy, endpoint, input mẫu).
- Đảm bảo dữ liệu/seed không gây lỗi: xem `scripts/seed-72h-data.js`.

## 7) Báo lỗi & Đề xuất
- Tạo issue với nội dung:
  - Mô tả vấn đề
  - Môi trường (OS, Node, MongoDB, Python)
  - Log/stack trace (nếu có)
  - Bước tái hiện
- Với đề xuất tính năng: mô tả use-case, tác động đến API/UI, dữ liệu liên quan.

## 8) Phát hành & triển khai
- Tham khảo [RELEASE_GUIDE.md](RELEASE_GUIDE.md) và [PM2_GUIDE.md](PM2_GUIDE.md).
- Với Render deployment, xem `render-build.sh`, `render.yaml`, `ecosystem.config.js`.

---

Cảm ơn bạn đã đóng góp cho Eco-Track! Mọi đóng góp đều được trân trọng và ghi nhận trong [CHANGELOG.md](CHANGELOG.md).