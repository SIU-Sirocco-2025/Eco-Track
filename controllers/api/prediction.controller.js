const models = require('../../models');
const path = require('path');
const { runPythonScriptWithStdin } = require('../../helpers/pythonRunner');

// Map tên quận sang model
const DISTRICT_MODEL_MAP = {
  'hcmc': models.HCMCReading,
  'district1': models.District1Reading,
  'district2': models.District2Reading,
  'district3': models.District3Reading,
  'district4': models.District4Reading,
  'district5': models.District5Reading,
  'district6': models.District6Reading,
  'district7': models.District7Reading,
  'district9': models.District9Reading,
  'district10': models.District10Reading,
  'district11': models.District11Reading,
  'binhThanh': models.BinhThanhReading,
  'phuNhuan': models.PhuNhuanReading,
  'tanPhu': models.TanPhuReading,
  'thuDuc': models.ThuDucReading,
  'binhTan': models.BinhTanReading
};

const DISTRICT_MODEL_FILE_MAP = {
  'hcmc': 'lstm_params_hcmc.json',
  'district1': 'lstm_params_district_1.json',
  'district2': 'lstm_params_district_2.json',
  'district3': 'lstm_params_district_3.json',
  'district4': 'lstm_params_district_4.json',
  'district5': 'lstm_params_district_5.json',
  'district6': 'lstm_params_district_6.json',
  'district7': 'lstm_params_district_7.json',
  'district9': 'lstm_params_district_9.json',
  'district10': 'lstm_params_district_10.json',
  'district11': 'lstm_params_district_11.json',
  'binhThanh': 'lstm_params_binh_thanh.json',
  'phuNhuan': 'lstm_params_phu_nhuan.json',
  'tanPhu': 'lstm_params_tan_phu.json',
  'thuDuc': 'lstm_params_thu_duc.json',
  'binhTan': 'lstm_params_binh_tan.json'
};

// Thêm Map để track requests đang chạy
const runningPredictions = new Map();

// [GET] /api/prediction/get-72h-data/:district
module.exports.get72hData = async (req, res) => {
  try {
    const { district } = req.params;

    if (!DISTRICT_MODEL_MAP[district]) {
      return res.status(400).json({
        success: false,
        message: `Quận không hợp lệ. Danh sách: ${Object.keys(DISTRICT_MODEL_MAP).join(', ')}`
      });
    }

    const Model = DISTRICT_MODEL_MAP[district];
    const records = await Model
      .find({ 'current.pollution.ts': { $exists: true } })
      .select('-raw')
      .sort({ 'current.pollution.ts': -1 })
      .limit(72)
      .lean();

    if (records.length < 72) {
      return res.status(404).json({
        success: false,
        message: `Chỉ tìm thấy ${records.length}/72 bản ghi`,
        data: records
      });
    }

    records.reverse();

    const inputData = records.map(record => ({
      timestamp: record.current.pollution.ts,
      aqius: record.current.pollution.aqius,
      aqicn: record.current.pollution.aqicn,
      mainus: record.current.pollution.mainus,
      maincn: record.current.pollution.maincn,
      temperature: record.current.weather.tp,
      humidity: record.current.weather.hu,
      pressure: record.current.weather.pr,
      windSpeed: record.current.weather.ws,
      windDirection: record.current.weather.wd
    }));

    return res.status(200).json({
      success: true,
      district: district,
      totalRecords: records.length,
      timeRange: {
        from: inputData[0].timestamp,
        to: inputData[inputData.length - 1].timestamp
      },
      data: inputData
    });

  } catch (error) {
    console.error('[API Error] get72hData:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

// [GET] /api/prediction/forecast-24h/:district
module.exports.forecast24h = async (req, res) => {
  try {
    const { district } = req.params;

    // Validate district
    if (!DISTRICT_MODEL_MAP[district]) {
      return res.status(400).json({
        success: false,
        message: `Quận không hợp lệ`
      });
    }

    // Kiểm tra đã có request đang chạy cho district này chưa
    if (runningPredictions.has(district)) {
      return res.status(429).json({
        success: false,
        message: `Đang dự đoán cho ${district}, vui lòng đợi...`
      });
    }

    // Đánh dấu đang chạy
    runningPredictions.set(district, true);

    // Kiểm tra model file
    const modelFileName = DISTRICT_MODEL_FILE_MAP[district];
    if (!modelFileName) {
      runningPredictions.delete(district);
      return res.status(404).json({
        success: false,
        message: `Chưa có model dự đoán cho ${district}`
      });
    }

    const modelPath = path.join(__dirname, '../../model_params', modelFileName);

    console.log(`[FORECAST] Bắt đầu dự đoán cho ${district}`);

    // Lấy 72h dữ liệu từ DB
    const Model = DISTRICT_MODEL_MAP[district];
    const records = await Model
      .find({ 'current.pollution.ts': { $exists: true } })
      .select('current.pollution current.weather')
      .sort({ 'current.pollution.ts': -1 })
      .limit(72)
      .lean();

    if (records.length < 72) {
      runningPredictions.delete(district);
      return res.status(404).json({
        success: false,
        message: `Không đủ dữ liệu. Chỉ có ${records.length}/72 bản ghi`
      });
    }

    records.reverse();

    // Tạo CSV string
    const districtLabel = getDistrictLabel(district);
    const csvHeader = 'timestamp,station,aqi\n';
    const csvRows = records.map(r => {
      const ts = new Date(r.current.pollution.ts).toISOString().replace('T', ' ').slice(0, 19);
      const aqi = r.current.pollution.aqius || 0;
      return `${ts},${districtLabel},${aqi}`;
    }).join('\n');
    
    const csvData = csvHeader + csvRows;

    // Gọi Python script với stdin
    const pythonScript = path.join(__dirname, '../../predict_from_json.py');
    const pythonArgs = ['--model', modelPath, '--stdin'];

    console.log(`[FORECAST] Đang chạy Python với stdin...`);
    const predictions = await runPythonScriptWithStdin(pythonScript, pythonArgs, csvData);

    // Xóa lock
    runningPredictions.delete(district);

    if (!predictions.success) {
      throw new Error(predictions.error || 'Prediction failed');
    }

    console.log(`[FORECAST] Dự đoán thành công cho ${district}`);

    // Trả về kết quả
    return res.status(200).json({
      ...predictions,
      district: district,
      districtLabel: districtLabel
    });

  } catch (error) {
    // Xóa lock khi lỗi
    runningPredictions.delete(req.params.district);
    
    console.error('[API Error] forecast24h:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi dự đoán',
      error: error.message
    });
  }
};

// [GET] /api/prediction/districts
module.exports.getAvailableDistricts = async (req, res) => {
  try {
    const districts = Object.keys(DISTRICT_MODEL_MAP).map(key => ({
      key: key,
      label: getDistrictLabel(key),
      hasModel: !!DISTRICT_MODEL_FILE_MAP[key]
    }));

    return res.status(200).json({
      success: true,
      districts: districts
    });
  } catch (error) {
    console.error('[API Error] getAvailableDistricts:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
};

function getDistrictLabel(key) {
  const labels = {
    'hcmc': 'Toàn TP.HCM',
    'district1': 'Quận 1',
    'district2': 'Quận 2',
    'district3': 'Quận 3',
    'district4': 'Quận 4',
    'district5': 'Quận 5',
    'district6': 'Quận 6',
    'district7': 'Quận 7',
    'district9': 'Quận 9',
    'district10': 'Quận 10',
    'district11': 'Quận 11',
    'binhThanh': 'Bình Thạnh',
    'phuNhuan': 'Phú Nhuận',
    'tanPhu': 'Tân Phú',
    'thuDuc': 'Thủ Đức',
    'binhTan': 'Bình Tân'
  };
  return labels[key] || key;
}