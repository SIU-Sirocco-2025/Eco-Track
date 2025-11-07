const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

// ENV
const API_BASE = process.env.API_BASE || 'http://api.airvisual.com/v2/city';
const API_KEY = process.env.API_KEY;
const CITY = process.env.CITY || 'ho chi minh city';
const STATE = process.env.STATE || 'ho chi minh city';
const COUNTRY = process.env.COUNTRY || 'vietnam';

function buildUrl() {
  if (!API_KEY) {
    throw new Error('Thiếu API_KEY trong .env');
  }
  return `${API_BASE}?city=${encodeURIComponent(CITY)}&state=${encodeURIComponent(STATE)}&country=${encodeURIComponent(COUNTRY)}&key=${encodeURIComponent(API_KEY)}`;
}

async function fetchAndLog() {
  const timestamp = new Date().toISOString();
  let url;
  try {
    url = buildUrl();
    const res = await axios.get(url, { timeout: 15000 });
    const root = res.data;
    const status = root?.status;
    if (status !== 'success') {
      console.log(`[${timestamp}] status!=success ->`, root);
      return;
    }
    const d = root.data || {};
    const pollution = d.current?.pollution || {};
    const weather = d.current?.weather || {};
    console.log(pollution);
    console.log(weather);
    // console.log(
    //   `[${timestamp}] AQI test: city="${d.city}" state="${d.state}" country="${d.country}" ` +
    //   `aqius=${pollution.aqius} main=${pollution.mainus} tempC=${weather.tp} hum=${weather.hu} wind=${weather.ws}`
    // );
  } catch (err) {
    console.error(`[${timestamp}] Lỗi gọi API:`, err.message || err, 'URL:', url);
  }
}

// Cron mỗi phút
cron.schedule('* * * * *', () => {
  console.log(`[${new Date().toISOString()}] Cron tick -> fetchAndLog()`);
  fetchAndLog();
});

// Gọi ngay khi start
fetchAndLog();