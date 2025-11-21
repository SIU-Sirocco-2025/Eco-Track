const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/aqi.controller');

router.get('/', controller.page);

router.get('/data', controller.latestPoints);

router.get('/history/:cityKey', controller.history);

router.get('/hour-latest', controller.latestCityHour);

router.get('/latest-reading', controller.latestCityReading);

module.exports = router;