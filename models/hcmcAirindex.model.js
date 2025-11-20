const mongoose = require("mongoose");
const { Schema } = mongoose;

const HCMCAirIndexSchema = new Schema(
  {
    _id: { type: Number, required: true }, // Location ID từ OpenAQ

    // Tọa độ trạm đo – GeoJSON Point
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true
      },
      coordinates: {
        type: [Number],  // [lng, lat]
        required: true
      }
    },

    // Cảm biến đo tại TP.HCM
    sensors: [
      {
        id: Number,          
        key: String,          // pm1 / pm10 / pm25 / rh / temp / pm0.3
        name: String,         
        displayName: String,  
        units: String         
      }
    ],

    // Thời điểm bắt đầu thu dữ liệu
    datetimeFirst: {
      utc: Date,
      local: String
    },

    // Thời điểm cập nhật mới nhất
    datetimeLast: {
      utc: Date,
      local: String
    },

    // License của dữ liệu
    licenses: [
      {
        id: Number,
        name: String,
        attributionName: String,
        attributionUrl: String,
        dateFrom: Date,
        dateTo: Date
      }
    ]
  },
  {
    timestamps: true // createdAt, updatedAt
  }
);

// Index tìm theo vị trí trạm đo
HCMCAirIndexSchema.index({ coordinates: "2dsphere" });

module.exports = mongoose.model("HCMCAirIndex", HCMCAirIndexSchema);