// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const HourSchema = new Schema(
  {
    // Thời điểm bắt đầu (UTC) của khung giờ — khóa chính
    from: { type: Date, required: true, unique: true, index: true },
    // Thời điểm kết thúc (UTC) của khung giờ
    to: { type: Date, required: true },

    // Chuỗi địa phương (+07:00) để hiển thị
    window: {
      fromLocal: String,
      toLocal: String
    },

    // measurements: { pm25: { parameter, value, unit, from, to }, ... }
    measurements: { type: Schema.Types.Mixed },

    // Mảng raw (các record gốc đã trả về từ từng sensor cho giờ đó)
    raw: { type: Array, select: false }
  },
  {
    collection: 'hcmc_air_hours',
    timestamps: true
  }
);

module.exports = mongoose.model('HCMCAirHour', HourSchema);