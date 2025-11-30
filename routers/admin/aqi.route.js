// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/aqi.controller');

// [GET] /admin/aqi - Danh sách AQI
router.get('/', controller.index);

// [GET] /admin/aqi/api/chart/:district - Lấy dữ liệu cho biểu đồ
router.get('/api/chart/:district', controller.getChartData);

// [GET] /admin/aqi/detail/:district - Chi tiết AQI theo quận
router.get('/detail/:district', controller.detail);

// [GET] /admin/aqi/export - Export dữ liệu AQI
router.get('/export', controller.export);

module.exports = router;
