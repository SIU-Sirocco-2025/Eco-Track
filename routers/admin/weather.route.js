// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/weather.controller');

// [GET] /admin/weather - Danh sách dữ liệu thời tiết
router.get('/', controller.index);

// [GET] /admin/weather/api/chart/:district - Lấy dữ liệu cho biểu đồ
router.get('/api/chart/:district', controller.getChartData);

// [GET] /admin/weather/detail/:district - Chi tiết thời tiết theo quận
router.get('/detail/:district', controller.detail);

// [GET] /admin/weather/export - Export dữ liệu thời tiết
router.get('/export', controller.export);

module.exports = router;
