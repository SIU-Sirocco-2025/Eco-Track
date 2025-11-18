import json
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import os
import sys
import argparse
from io import StringIO

# ============================================================================
# BƯỚC 1: ĐỊNH NGHĨA MODEL LSTM
# ============================================================================

class LSTMModel(nn.Module):
    def __init__(self, input_size=72, hidden_size=64, output_size=24, num_layers=1):
        super(LSTMModel, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers=num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        x = x.unsqueeze(1)
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out

# ============================================================================
# BƯỚC 2: HÀM LOAD MODEL TỪ JSON
# ============================================================================

def load_model_from_json(json_path):
    with open(json_path, 'r') as f:
        model_data = json.load(f)
    
    arch = model_data['model_architecture']
    model = LSTMModel(
        input_size=arch['input_size'],
        hidden_size=arch['hidden_size'],
        output_size=arch['output_size'],
        num_layers=arch['num_layers']
    )
    
    state_dict = {}
    for key, value in model_data['parameters'].items():
        state_dict[key] = torch.FloatTensor(value)
    
    model.load_state_dict(state_dict)
    model.eval()
    return model

# ============================================================================
# BƯỚC 3: HÀM LẤY DỮ LIỆU INPUT TỪ CSV STRING
# ============================================================================

def get_input_data_from_csv_string(csv_string, hours=72):
    """Đọc CSV từ string thay vì file"""
    df = pd.read_csv(StringIO(csv_string))
    
    # Kiểm tra cột
    aqi_col = None
    if 'aqi' in df.columns:
        aqi_col = 'aqi'
    elif 'aqius' in df.columns:
        aqi_col = 'aqius'
    else:
        raise ValueError("CSV phải có cột 'aqi' hoặc 'aqius'")
    
    # Xử lý NaN
    df[aqi_col] = pd.to_numeric(df[aqi_col], errors='coerce')
    df[aqi_col] = df[aqi_col].ffill().bfill().fillna(50.0)
    
    # Lấy 72 giá trị
    aqi_values = df[aqi_col].values[:hours]
    
    # Padding nếu thiếu
    if len(aqi_values) < hours:
        last_value = aqi_values[-1] if len(aqi_values) > 0 else 50.0
        aqi_values = np.pad(aqi_values, (0, hours - len(aqi_values)), 
                           constant_values=last_value)
    
    return aqi_values

# ============================================================================
# BƯỚC 4: HÀM CHUẨN BỊ SCALERS
# ============================================================================

def prepare_scalers_from_data(input_data):
    min_val = max(0, float(input_data.min()) - 10)
    max_val = float(input_data.max()) + 10
    
    scaler_X = MinMaxScaler(feature_range=(0, 1))
    scaler_Y = MinMaxScaler(feature_range=(0, 1))
    
    scaler_X.fit(np.array([[min_val]*72, [max_val]*72]))
    scaler_Y.fit(np.array([[min_val]*24, [max_val]*24]))
    
    return scaler_X, scaler_Y

# ============================================================================
# BƯỚC 5: HÀM DỰ ĐOÁN
# ============================================================================

def predict_24h(model, input_data, scaler_X, scaler_Y):
    input_scaled = scaler_X.transform([input_data])
    input_tensor = torch.FloatTensor(input_scaled)
    
    with torch.no_grad():
        output = model(input_tensor)
        output_np = output.numpy()
    
    predictions = scaler_Y.inverse_transform(output_np)[0]
    predictions = [max(0, float(p)) for p in predictions]
    
    return predictions

# ============================================================================
# BƯỚC 6: HÀM PHÂN LOẠI CHẤT LƯỢNG KHÔNG KHÍ
# ============================================================================

def get_aqi_quality(aqi):
    if aqi <= 50:
        return "Tốt"
    elif aqi <= 100:
        return "Trung Binh"
    elif aqi <= 150:
        return "Kém"
    elif aqi <= 200:
        return "Xấu"
    elif aqi <= 300:
        return "Rất xấu"
    else:
        return "Nguy hại"

# ============================================================================
# BƯỚC 7: HÀM MAIN CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='Dự đoán AQI 24h')
    parser.add_argument('--model', required=True, help='Đường dẫn file JSON model')
    parser.add_argument('--stdin', action='store_true', help='Đọc CSV từ stdin thay vì file')
    
    args = parser.parse_args()
    
    try:
        # Load model
        model = load_model_from_json(args.model)
        
        # Đọc CSV từ stdin
        if args.stdin:
            csv_string = sys.stdin.read()
            input_data = get_input_data_from_csv_string(csv_string, hours=72)
        else:
            raise ValueError("Phải dùng --stdin để đọc dữ liệu")
        
        # Prepare scalers
        scaler_X, scaler_Y = prepare_scalers_from_data(input_data)
        
        # Predict
        predictions = predict_24h(model, input_data, scaler_X, scaler_Y)
        
        # Tạo output JSON
        from datetime import datetime, timedelta
        current_time = datetime.now()
        
        result = {
            "success": True,
            "model": os.path.basename(args.model),
            "predicted_at": current_time.isoformat(),
            "input_summary": {
                "hours": 72,
                "min_aqi": round(float(input_data.min()), 1),
                "max_aqi": round(float(input_data.max()), 1),
                "mean_aqi": round(float(input_data.mean()), 1)
            },
            "predictions": []
        }
        
        for i, pred in enumerate(predictions, 1):
            forecast_time = current_time + timedelta(hours=i)
            result["predictions"].append({
                "hour": i,
                "timestamp": forecast_time.isoformat(),
                "aqius": round(pred, 1),
                "quality": get_aqi_quality(pred)
            })
        
        result["statistics"] = {
            "mean": round(float(np.mean(predictions)), 1),
            "max": round(float(np.max(predictions)), 1),
            "min": round(float(np.min(predictions)), 1),
            "max_hour": int(np.argmax(predictions) + 1),
            "min_hour": int(np.argmin(predictions) + 1)
        }
        
        # In ra stdout
        print(json.dumps(result, ensure_ascii=False))
        return 0
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False), file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
