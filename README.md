<div align="center">
  <h1>🌿 Eco-Track</h1>
  <p><em>Theo dõi, lưu trữ & dự đoán chất lượng không khí theo thời gian thực cho Thành phố Hồ Chí Minh</em></p>
</div>

**Eco-Track** là dự án mã nguồn mở của đội **SIU_Sirocco (SIU)** phục vụ mục tiêu thu thập, chuẩn hoá và lưu trữ dữ liệu **chỉ số ô nhiễm không khí (AQI)** và **thông tin thời tiết** theo quận/huyện tại TP. Hồ Chí Minh. Dữ liệu được lấy từ AirVisual API và được lưu vào MongoDB để phân tích, trực quan hóa và phục vụ nghiên cứu sau này.

---

## 🔍 Tổng quan
Eco-Track thu thập dữ liệu AQI + thời tiết theo khu vực, chuẩn hoá cấu trúc dữ liệu, lưu lịch sử vào MongoDB và cung cấp API để:
- Hiển thị dashboard trực quan (biểu đồ, bản đồ, heatmap)
- Truy vấn dữ liệu theo thời gian
- Phân tích xu hướng
- **Dự đoán AQI & thời tiết ngắn hạn (1–24 giờ)**

---

## ✨ Tính năng chính

### 1. 📡 Thu thập dữ liệu thời gian thực
- Lấy dữ liệu từ AirVisual API theo nhiều quận/huyện.
- Đồng bộ theo lịch (cron job).
- Lưu trữ vào MongoDB dạng chuỗi thời gian.

### 2. 🗃 Chuẩn hoá & Lưu trữ dữ liệu
- Chuẩn hoá các trường thời tiết, AQI, chất gây ô nhiễm.
- Tối ưu cho phân tích và truy vấn theo timestamp.

### 3. 📊 Dashboard trực quan
- Biểu đồ AQI theo thời gian
- Nhiệt độ, độ ẩm, tốc độ gió theo khu vực
- Heatmap theo quận/huyện
- So sánh mức độ ô nhiễm giữa các khu vực

---

## 🔮 4. Chức năng Dự đoán (AQI & Thời tiết)
Eco-Track tích hợp mô-đun **AI/ML Forecasting** để dự đoán xu hướng **AQI** và **thông số thời tiết** cho từng quận/huyện trong 1–24 giờ tới.

### 🎯 Mục tiêu dự đoán
- Dự đoán AQI ngắn hạn theo từng khu vực  
- Dự đoán nhiệt độ, độ ẩm, tốc độ gió  
- Cảnh báo xu hướng gia tăng ô nhiễm (early warning)

### 🧠 Cách mô hình dự đoán hoạt động
Dữ liệu được đưa qua pipeline:
1. Tiền xử lý, chuẩn hoá chuỗi thời gian  
2. Áp dụng các thuật toán:
   - **ARIMA / SARIMA** – dự đoán chuỗi thời gian truyền thống  
   - **LSTM Neural Network** – học xu hướng dài  
   - **Moving Average Forecast** – cho mô hình nhẹ  
3. Tạo ra dự đoán 1–24 giờ cho từng quận/huyện

### 📈 Hiển thị dự đoán trên Dashboard
- Biểu đồ đường (Actual vs Forecast)  
- Biểu đồ xu hướng tăng giảm AQI  
- Heatmap dự đoán mức ô nhiễm  
- Cảnh báo vượt ngưỡng AQI 50/100/150/200  


