
# Template Web Node.js + PugJS

Đây là template dự án web sử dụng **Node.js**, **Express**, **PugJS** với cấu trúc tách biệt cho client và admin, hỗ trợ flash message, session, static file, và tích hợp TinyMCE.

## Tính năng

- Quản lý layout, partials, mixins cho client và admin.
- Sử dụng PugJS cho view engine.
- Tích hợp Bootstrap, FontAwesome, Bootstrap Icons.
- Hỗ trợ flash message, session, cookie.
- Tích hợp TinyMCE cho soạn thảo văn bản.
- Tách biệt route/controller/model cho client và admin.
- Hỗ trợ custom middleware.

## Cài đặt

### 1. Clone dự án

```sh
git clone https://github.com/SmallChicken2k5/template-web-nodejs-pugjs.git
cd template-web-nodejs-pugjs
```

### 2. Cài đặt package

```sh
npm install
```

### 3. Cấu hình môi trường

Tạo file `.env` (nếu chưa có):

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/mydatabase
```

### 4. Chạy dự án

```sh
npm start
```
Hoặc:
```sh
node index.js
```

Truy cập: [http://localhost:3000](http://localhost:3000)

## Cấu trúc thư mục

```
.
├── controllers/      # Controllers cho client và admin
├── helpers/          # Helper functions
├── middlewares/      # Middlewares cho client và admin
├── models/           # Models (nếu dùng database)
├── public/           # Static files (css, js, images)
├── routers/          # Routers cho client và admin
├── views/            # Pug templates (layouts, partials, pages, mixins)
├── config/           # Cấu hình hệ thống
├── index.js          # File chạy chính
├── package.json
└── .env
```

## Thêm route mới

- **Client:** Thêm file route/controller vào `routers/client/` và `controllers/client/`.
- **Admin:** Thêm file route/controller vào `routers/admin/` và `controllers/admin/`.

## Thêm trang mới

1. Tạo file `.pug` trong `views/client/pages/` hoặc `views/admin/pages/`.
2. Kế thừa layout phù hợp:
		```pug
		extends ../../layouts/default.pug
		block main
			// Nội dung trang
		```

## Ghi chú

- Đảm bảo đã cài đặt MongoDB nếu sử dụng database.
- Để thay đổi đường dẫn admin, sửa `prefixAdmin` trong `config/system.js`.
- Static files cho client nằm ở `public/client/`, cho admin ở `public/admin/`.

---

**Template by [SmallChicken2k5](https://github.com/SmallChicken2k5)**
