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