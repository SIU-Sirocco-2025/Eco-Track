// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/api/prediction.controller');

// GET /api/prediction/get-72h-data/:district
router.get('/get-72h-data/:district', controller.get72hData);

// GET /api/prediction/forecast-24h/:district - API MỚI
router.get('/forecast-24h/:district', controller.forecast24h);

// GET /api/prediction/districts
router.get('/districts', controller.getAvailableDistricts);

module.exports = router;