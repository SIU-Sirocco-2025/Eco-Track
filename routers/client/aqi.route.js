// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/aqi.controller');
const { validateApiKey } = require('../../middlewares/auth.middleware');

router.get('/', controller.page);

router.get('/data', controller.latestPoints);

router.get('/history/:cityKey', validateApiKey, controller.history);

router.get('/hour-latest', controller.latestCityHour);

router.get('/latest-reading', controller.latestCityReading);

router.get('/by-datetime/:cityKey', validateApiKey, controller.byDateTime);

// API mới - Thống kê và phân tích
router.get('/compare', controller.compareDistricts);

router.get('/statistics/:cityKey', validateApiKey, controller.statistics);

router.get('/trend/:cityKey', validateApiKey, controller.trend);

router.get('/filter', validateApiKey, controller.filter);

router.get('/export/:cityKey', validateApiKey, controller.exportData);

router.get('/hourly-average/:cityKey', validateApiKey, controller.hourlyAverage);

module.exports = router;