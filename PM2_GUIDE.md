# PM2 Guide - Chạy Eco-Track Tự Động

## Cài đặt PM2 (chỉ cần 1 lần)
```bash
npm install -g pm2
```

## Các lệnh quản lý

### 1. Khởi động app (tự động sync )
```bash
npm run pm2:start
# hoặc
pm2 start ecosystem.config.js
```

### 2. Dừng app
```bash
npm run pm2:stop
# hoặc
pm2 stop eco-track
```

### 3. Restart app
```bash
npm run pm2:restart
# hoặc
pm2 restart eco-track
```

### 4. Xem logs realtime
```bash
npm run pm2:logs
# hoặc
pm2 logs eco-track
```

### 5. Monitor CPU & Memory
```bash
npm run pm2:monitor
# hoặc
pm2 monit
```

### 6. Xem trạng thái
```bash
pm2 status
```

### 7. Tự động khởi động khi boot máy
```bash
pm2 startup
pm2 save
```

## Kiểm tra sync realtime

Sau khi start bằng PM2, app sẽ:
- ✅ Tự động sync 72h dữ liệu khi khởi động
- ✅ Tự động kiểm tra dữ liệu mới mỗi 30 phút
- ✅ Tự động sync khi có dữ liệu mới từ OpenAQ
- ✅ AQI các quận luôn chênh ±12 so với HCMC

Xem logs để kiểm tra:
```bash
pm2 logs eco-track --lines 50
```

## Xóa app khỏi PM2
```bash
pm2 delete eco-track
```
