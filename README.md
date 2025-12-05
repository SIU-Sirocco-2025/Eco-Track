<div align="center">
  <img src="public/client/image/logo.png" alt="Eco-Track Logo" width="200"/>

  # Eco-Track 🌿
  ### Hệ Thống Theo Dõi & Dự Đoán Chất Lượng Không Khí TP.HCM

  > "Theo dõi hôm nay để bảo vệ bầu trời ngày mai."

  [![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE)

  <a href="http://ecotrack.asia">
    <img src="https://img.shields.io/badge/🚀_Demo-Eco_Track-00C853?style=for-the-badge" alt="Demo System"/>
  </a>
  <a href="http://ecotrack.asia/api/docs">
    <img src="https://img.shields.io/badge/📚_Docs-Eco_Track-1976D2?style=for-the-badge" alt="Documentation"/>
  </a>

  <br/>

  <a href="https://ecotrack.asia/api/docs">📖 API Docs</a> •
  <a href="https://ecotrack.asia/aqi">🗺 Bản đồ AQI</a> •
  <a href="https://ecotrack.asia/admin/dashboard">📊 Dashboard Admin</a> •
  <a href="RELEASE_GUIDE.md">🚀 Release Guide</a> •
  <a href="CONTRIBUTING.md">🤝 Đóng Góp</a>
  <a href="CHANGELOG.md">📝 Changelog</a>
</div>

---

## 📋 Tổng Quan

Eco-Track thu thập, chuẩn hoá và lưu trữ dữ liệu chỉ số ô nhiễm không khí (AQI) và thông tin thời tiết theo quận/huyện tại TP. Hồ Chí Minh.  
Dữ liệu thời gian thực được lấy từ OpenAQ API v3 và lưu vào MongoDB để phân tích, trực quan hoá và dự đoán.

Hệ thống cho phép:
- Hiển thị dashboard trực quan (biểu đồ, bản đồ, heatmap)
- Truy vấn dữ liệu theo thời gian và khu vực
- Phân tích xu hướng chất lượng không khí
- Dự đoán AQI ngắn hạn (24 giờ) bằng mô hình ML

---

## 🏗️ Kiến Trúc & Công Nghệ

- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Views: Pug (client & admin)
- Frontend libs: Bootstrap 5, Leaflet.js, Chart.js
- Scheduler: node-cron (thu thập OpenAQ theo giờ)
- ML: Python (NumPy, Pandas, scikit-learn, PyTorch) gọi qua Node

Tham chiếu mã nguồn:
- Cấu hình DB: [config/database.js](config/database.js)
- Mô hình dữ liệu AQI: [models/index.js](models/index.js), các model quận như [models/district1.model.js](models/district1.model.js), [models/hcmc.model.js](models/hcmc.model.js)
- Dữ liệu theo giờ OpenAQ: [models/hcmcAirHour.model.js](models/hcmcAirHour.model.js), [models/hcmcAirindex.model.js](models/hcmcAirindex.model.js)
- Thu thập OpenAQ: [scripts/fetch-openaq-hours.js](scripts/fetch-openaq-hours.js)
- Đồng bộ AQI sang các quận: [services/aqiSyncService.js](services/aqiSyncService.js), [scripts/sync-openaq-to-districts.js](scripts/sync-openaq-to-districts.js)
- API AQI client: [controllers/client/aqi.controller.js](controllers/client/aqi.controller.js)
- API Dự đoán: [controllers/api/prediction.controller.js](controllers/api/prediction.controller.js), Python runner [helpers/pythonRunner.js](helpers/pythonRunner.js), script ML [predict_from_json.py](predict_from_json.py)
- Giao diện: Client [views/client/pages/home/index.pug](views/client/pages/home/index.pug), Docs [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug), Admin AQI [views/admin/pages/aqi/index.pug](views/admin/pages/aqi/index.pug), Admin Weather [views/admin/pages/weather/index.pug](views/admin/pages/weather/index.pug)

Lưu ý: Mọi tham chiếu AirVisual đã bị loại bỏ. Script cũ [scripts/fetch-and-save.js](scripts/fetch-and-save.js) không còn được khuyến nghị sử dụng.

---

## ✨ Tính Năng Chính

### 1) 📡 Thu Thập Dữ Liệu (OpenAQ v3)
- Lấy dữ liệu cảm biến theo giờ của TP.HCM từ OpenAQ
- Lưu raw giờ vào collection HCMCAirHour
- Map và chuẩn hoá AQI cho từng quận

Script:
- Thu thập: [scripts/fetch-openaq-hours.js](scripts/fetch-openaq-hours.js)
- Chuyển đổi/quy đổi AQI: [services/aqiSyncService.js](services/aqiSyncService.js)
- Kiểm tra dữ liệu mới nhất: [scripts/check-latest-openaq.js](scripts/check-latest-openaq.js)

### 2) 🗃 Chuẩn Hoá & Lưu Trữ
- Schema chuẩn: `current.pollution` (AQI US, mainus) và `current.weather` (tp, hu, pr, ws, wd)
- Model mỗi quận: ví dụ [models/district3.model.js](models/district3.model.js)
- Thành phố: [models/hcmc.model.js](models/hcmc.model.js)

### 3) 📊 Dashboard & UI
- Client:
  - Trang chủ: [views/client/pages/home/index.pug](views/client/pages/home/index.pug)
  - API docs: [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)
  - JS bản đồ/heatmap: [public/client/js/script.js](public/client/js/script.js)
- Admin:
  - AQI: [views/admin/pages/aqi/index.pug](views/admin/pages/aqi/index.pug)
  - Weather: [views/admin/pages/weather/index.pug](views/admin/pages/weather/index.pug)

### 4) 🔮 Dự Đoán AQI 24h
- Tham số LSTM (JSON) trong `model_params/`
- Dự đoán qua Python: [predict_from_json.py](predict_from_json.py)
- Gọi từ Node: [controllers/api/prediction.controller.js](controllers/api/prediction.controller.js), [helpers/pythonRunner.js](helpers/pythonRunner.js)
- UI dự báo: [public/client/js/forecast.js](public/client/js/forecast.js)

---

## 🌐 API

### Standard REST API
- AQI Client Endpoints: xem [controllers/client/aqi.controller.js](controllers/client/aqi.controller.js)
- Prediction Endpoints: xem [controllers/api/prediction.controller.js](controllers/api/prediction.controller.js)
- API Docs giao diện: [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)
- Xem chi tiết API Docs: https://ecotrack.asia/api/docs

### NGSI-LD API
Eco-Track tuân thủ chuẩn NGSI-LD (ETSI GS CIM 009) cho tương tác Smart City:

- Context: `GET /api/ngsi-ld/context`
- Query Entities: `GET /api/ngsi-ld/entities/:district`
- Temporal Query: `GET /api/ngsi-ld/entities/:district/temporal`
- All Entities: `GET /api/ngsi-ld/entities`
- Predictions: `POST /api/ngsi-ld/predictions/:district`

Context definition: [public/context.jsonld](public/context.jsonld) hoặc endpoint `/api/ngsi-ld/context`

#### Ví dụ sử dụng NGSI-LD:

```bash
# Lấy AQI entity mới nhất
curl -H "Accept: application/ld+json" \
   https://ecotrack.asia/api/ngsi-ld/entities/district1

# Truy vấn temporal (24h gần nhất)
curl -H "Accept: application/ld+json" \
   "https://ecotrack.asia/api/ngsi-ld/entities/district1/temporal?limit=24"
```

## NGSI-LD & FIWARE Integration
- Chuẩn: NGSI-LD / JSON-LD / FIWARE AirQualityObserved / SOSA / SSN
- Context: động `/api/ngsi-ld/context` và tĩnh [public/context.jsonld](public/context.jsonld)

### AirQualityObserved (FIWARE)
- Entity type: AirQualityObserved
- ID dạng: `urn:ngsi-ld:AirQualityObserved:<districtKey>[:<epoch>]`
- Thuộc tính: `aqiUS`, `dateObserved`, `location`, `mainPollutant`

### Prediction
- Hàm chuyển đổi: [`helpers.ngsiLdConverter.predictionToNGSILD`](helpers/ngsiLdConverter.js)

---

## 🔧 Yêu Cầu Hệ Thống

- Node.js >= 16.x, npm/yarn
- MongoDB (local/Atlas)
- Python 3.9+ nếu dùng dự đoán
- Git

Biến môi trường (.env) mẫu:
```env
PORT=3000
BASE_URL=http://localhost:3000
MONGODB_URL=<your-mongodb-url>  # bắt buộc

# OpenAQ API (tuỳ chọn nếu chạy cron/sync OpenAQ)
OPENAQ_API_BASE=https://api.openaq.org/v3
OPENAQ_API_KEY=<your-openaq-api-key>
OPENAQ_FETCH_INTERVAL=0 * * * *   # cron: mỗi giờ phút 0
SYNC_INTERVAL_MINUTES=30          # đồng bộ quận mỗi 30 phút

# NGSI-LD / Orion-LD (tuỳ chọn)
USE_ORION=false

# Session
SESSION_SECRET=<your-secret>

# SMTP Email (bắt buộc nếu dùng tính năng OTP/email)
EMAIL_USER=<your-email>
EMAIL_PASS=<your-app-password>

# Google OAuth (tùy chọn)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

---

## 📥 Cài Đặt & Chạy

### 🗄️ Hướng Dẫn Tạo MongoDB

#### Lựa chọn 1: MongoDB Atlas (Cloud - Khuyến nghị)

1. **Tạo tài khoản MongoDB Atlas**
   - Truy cập: https://www.mongodb.com/cloud/atlas/register
   - Đăng ký tài khoản miễn phí

2. **Tạo Cluster mới**
   - Sau khi đăng nhập, chọn "Build a Database"
   - Chọn plan FREE (M0 Sandbox - 512MB)
   - Chọn region gần nhất (Singapore hoặc Tokyo cho Việt Nam)
   - Đặt tên cluster (ví dụ: `eco-track-cluster`)

3. **Cấu hình Database Access**
   - Vào mục "Database Access" → "Add New Database User"
   - Tạo username và password (lưu lại để dùng sau)
   - Chọn role: "Read and write to any database"

4. **Cấu hình Network Access**
   - Vào mục "Network Access" → "Add IP Address"
   - Chọn "Allow Access from Anywhere" (0.0.0.0/0) cho dev
   - Production: chỉ thêm IP cụ thể của server

5. **Lấy Connection String**
   - Vào "Database" → "Connect" → "Connect your application"
   - Chọn Driver: Node.js, Version: 4.1 or later
   - Copy connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/<dbname>?retryWrites=true&w=majority
   ```
   - Thay `<username>`, `<password>`, `<dbname>` (ví dụ: `ecotrack`)

6. **Cập nhật file .env**
   ```env
   MONGODB_URL=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/ecotrack?retryWrites=true&w=majority
   ```

#### Lựa chọn 2: MongoDB Local (Development)

1. **Cài đặt MongoDB Community Edition**
   - Windows: https://www.mongodb.com/try/download/community
   - Tải installer và chạy với cấu hình mặc định
   - Chọn "Install MongoDB as a Service"

2. **Khởi động MongoDB Service**
   ```bash
   # Kiểm tra service đang chạy
   net start MongoDB
   
   # Nếu chưa chạy, khởi động:
   "C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe" --dbpath "C:\data\db"
   ```

3. **Tạo database (tuỳ chọn, sẽ tự động tạo khi insert)**
   ```bash
   # Mở MongoDB Shell
   mongosh
   
   # Chọn/tạo database
   use ecotrack
   ```

4. **Cập nhật file .env**
   ```env
   MONGODB_URL=mongodb://localhost:27017/ecotrack
   ```

### 📧 Hướng Dẫn Cấu Hình SMTP Email

Eco-Track sử dụng SMTP để gửi email OTP, thông báo, v.v.

#### Gmail SMTP (Khuyến nghị cho dev/test)

1. **Tạo App Password cho Gmail**
   - Đăng nhập Gmail
   - Vào: https://myaccount.google.com/security
   - Bật "2-Step Verification" (bắt buộc)
   - Tìm "App passwords" → Tạo mật khẩu ứng dụng mới
   - Chọn app: "Mail", device: "Other" (đặt tên: Eco-Track)
   - Copy mật khẩu 16 ký tự (dạng: `xxxx xxxx xxxx xxxx`)

2. **Cấu hình .env**
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=xxxx xxxx xxxx xxxx  # App password vừa tạo (bỏ khoảng trắng)
   ```

### 1) Cài đặt dependencies
```bash
git clone https://github.com/SIU-Sirocco-2025/Eco-Track.git
cd Eco-Track
npm install
```

### 2) Tạo và cấu hình .env
- Tạo file `.env` từ mẫu bên trên.
- Bắt buộc cấu hình:
  - `MONGODB_URL` trỏ tới MongoDB hợp lệ.
  - `SESSION_SECRET` là chuỗi bí mật bất kỳ.
- Nếu dùng email OTP, cấu hình `EMAIL_USER` và `EMAIL_PASS`.

### 3) Kết nối DB
- Ứng dụng sẽ dùng giá trị `MONGODB_URL` để kết nối tại [config/database.js](config/database.js).

### 4) Chạy server (dev hoặc production)
```bash
npm run dev   # nodemon, phù hợp phát triển
# hoặc
npm start     # production mode
```
- Mặc định: http://localhost:3000
- Routes chính:
  - Client AQI: [routers/client/index.route.js](routers/client/index.route.js) → trang [views/client/pages/aqi/index.pug](views/client/pages/aqi/index.pug)
  - API client: [controllers/client/aqi.controller.js](controllers/client/aqi.controller.js)
  - API dự đoán: [controllers/api/prediction.controller.js](controllers/api/prediction.controller.js)
  - Docs UI: [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug) → http://localhost:3000/api/docs

### 5) Seed dữ liệu demo 72h (tuỳ chọn)
- Nếu bạn chưa cấu hình cron/không có dữ liệu OpenAQ, seed mẫu để kiểm thử UI/API:
```bash
node scripts/seed-72h-data.js
```
- Script sẽ tạo dữ liệu chuẩn cho các model quận: xem [scripts/seed-72h-data.js](scripts/seed-72h-data.js) và các model trong [models/index.js](models/index.js).



### 6) Thu thập OpenAQ theo giờ (tuỳ chọn)
- Dùng khi có `OPENAQ_API_KEY` và muốn dữ liệu thật và script ban đầu sẽ cố gắng lấy 100 giờ trước đó:
```bash
node scripts/fetch-openaq-hours.js
```
- Dữ liệu giờ lưu vào [`HCMCAirHour`](models/hcmcAirHour.model.js). Sau đó đồng bộ/bản đồ hoá sang các quận qua dịch vụ:
  - Đồng bộ tự động trong service: [services/aqiSyncService.js](services/aqiSyncService.js) hoặc script tiện ích [scripts/sync-openaq-to-districts.js](scripts/sync-openaq-to-districts.js).

### 6.1) Đồng bộ OpenAQ sang dữ liệu quận (scripts/sync-openaq-to-districts.js)

- Dùng khi bạn **đã có dữ liệu giờ trong** [`HCMCAirHour`](models/hcmcAirHour.model.js) (từ script trên) và muốn đổ sang các collection quận (`district*_readings`, `hcmc_readings`) để:
  - Xem trên bản đồ client, dashboard admin
  - Test nhanh mà không cần chạy `services/aqiSyncService` trong server

```bash
# Mặc định: sync 72 giờ gần nhất
node scripts/sync-openaq-to-districts.js

# Tuỳ chọn: sync N giờ gần nhất (ví dụ 168 giờ = 7 ngày)
node scripts/sync-openaq-to-districts.js 168
```

- Script sẽ:
  - Đọc N bản ghi mới nhất từ `hcmc_air_hours`
  - Tính AQI tổng hợp từ các pollutants (PM2.5, PM10, O₃, NO₂, SO₂, CO) bằng hàm `calculateOverallAQI` trong [scripts/sync-openaq-to-districts.js](scripts/sync-openaq-to-districts.js)
  - Sinh dữ liệu `current.pollution` và `current.weather` cho từng quận theo schema chuẩn trong [models/baseReadingSchema.js](models/baseReadingSchema.js)
  - Ghi vào các collection quận trong [models/index.js](models/index.js) (ví dụ [models/district3.model.js](models/district3.model.js), [models/hcmc.model.js](models/hcmc.model.js))

> Lưu ý: nếu bạn dùng chế độ sync tự động trong [services/aqiSyncService.js](services/aqiSyncService.js) thì **không cần** chạy script này thường xuyên, chỉ dùng khi muốn “đổ lại” dữ liệu lịch sử thủ công.

### 7) Kiểm tra dữ liệu OpenAQ gần nhất (tuỳ chọn)
```bash
node scripts/check-latest-openaq.js
```
- In 10 bản ghi mới nhất của [`HCMCAirHour`](models/hcmcAirHour.model.js) để kiểm chứng.

### 8) Dự đoán AQI 24h (tuỳ chọn)
- Cài đặt/kiểm tra phụ thuộc Python:
```bash
node scripts/check-python-deps.js
```
### 9) NGSI‑LD API (tuỳ chọn)
- Kiểm thử nhanh các endpoint NGSI‑LD
```bash
node scripts/test-ngsi-ld.js
```

- Script dùng [`helpers.checkPythonDeps.ensurePythonDependencies`](helpers/checkPythonDeps.js) để tự động kiểm tra torch/pandas/numpy/sklearn và cài bằng pip nếu thiếu.
- API dự đoán gọi Python runner: [`helpers.pythonRunner.runPythonScriptWithStdin`](helpers/pythonRunner.js) chạy [`predict_from_json.py`](predict_from_json.py).
- Tham số mô hình LSTM: thư mục [model_params/](model_params/), ánh xạ trong [`controllers/api/prediction.controller.js`](controllers/api/prediction.controller.js).

### 9) NGSI-LD API (tuỳ chọn)
- Context: `GET /api/ngsi-ld/context` và file tĩnh [public/context.jsonld](public/context.jsonld)
- Thực thể và chuyển đổi: [`helpers.ngsiLdConverter`](helpers/ngsiLdConverter.js), controllers: [controllers/api/aqiNgsiLd.controller.js](controllers/api/aqiNgsiLd.controller.js)

### 10) Chạy bằng PM2 (production khuyến nghị)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 logs
pm2 restart ecosystem.config.js
```
- Xem hướng dẫn chi tiết: [PM2_GUIDE.md](PM2_GUIDE.md).

---

## 📁 Cấu Trúc Thư Mục
- `config/` – Cấu hình hệ thống
- `controllers/` – Logic client, admin, api
- `models/` – Schema Mongoose (AQI, thời tiết, giờ, index)
- `routers/` – Định tuyến
- `views/` – Giao diện Pug
- `public/` – Tài nguyên tĩnh
- `scripts/` – Cron, seed, tiện ích
- `helpers/` – Python runner, kiểm tra deps   

---

## 🔖 Release
- Hướng dẫn chi tiết: xem [RELEASE_GUIDE.md](RELEASE_GUIDE.md)
- Lịch sử thay đổi: xem [CHANGELOG.md](CHANGELOG.md)
- Quick steps phát hành:
  1) Tăng version trong package.json và cập nhật [CHANGELOG.md](CHANGELOG.md)
  2) Commit: `chore: release vX.Y.Z`
  3) Tạo tag và đẩy lên Git:
     ```bash
     git tag vX.Y.Z
     git push origin vX.Y.Z
     ```
  4) Tạo GitHub Release, đính kèm nội dung từ [CHANGELOG.md](CHANGELOG.md)

---

## 🤝 Đóng Góp
```bash
git checkout -b feat/<ten-tinh-nang>
git commit -m "feat: <mo-ta-ngan-gon>"
git push -u origin feat/<ten-tinh-nang>
```

---

## 🐛 Báo Lỗi & Góp Ý
- Tạo issue: https://github.com/SIU-Sirocco-2025/Eco-Track/issues

---

## 📊 Giấy Phép Dữ Liệu Mở
Dữ liệu được xuất bản theo giấy phép **ODC-BY 1.0**.  
Xem chi tiết tại [DATA_LICENSE.md](DATA_LICENSE.md).

## 📜 Giấy Phép Thư Viện Phụ Thuộc

Danh sách giấy phép của tất cả dependencies (npm, Python) được tổng hợp tại [DEPENDENCIES_LICENSES.md](DEPENDENCIES_LICENSES.md).

- Tự động tạo từ package.json và yêu cầu Python bằng script kiểm kê.
- Mục tiêu: minh bạch bản quyền, tuân thủ phân phối theo GPL-3.0.

## 📄 Giấy Phép
Phân phối theo GNU GPL v3.0. Xem [LICENSE](LICENSE).

© 2025 Eco-Track – Cùng xây dựng bầu không khí trong lành cho TP. Hồ Chí Minh 🌿