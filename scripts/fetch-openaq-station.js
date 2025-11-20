const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const database = require('../config/database');
database.connect();

const models = require('../models');

const OPENAQ_API_BASE = process.env.OPENAQ_API_BASE || 'https://api.openaq.org/v3';
const OPENAQ_API_KEY = process.env.OPENAQ_API_KEY || '8e8b4c78047f0874569a44786a83ed7c0115bed2e3ab63f2c55c8c08d9ff7d39';
const LOCATION_ID = parseInt(process.env.OPENAQ_LOCATION_ID || '3276359');

const MAX_RETRY = parseInt(process.env.API_MAX_RETRY || '3', 10);
const CRON_INTERVAL = process.env.OPENAQ_FETCH_INTERVAL || '*/0 * * * *';

let isRunning = false;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch thông tin location từ OpenAQ v3
 */
async function fetchLocationData(attempt = 1) {
  const url = `${OPENAQ_API_BASE}/locations/${LOCATION_ID}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': OPENAQ_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 15000,
      validateStatus: () => true
    });

    if (response.status === 200 && response.data?.results) {
      // FIX: Lấy phần tử đầu tiên của mảng
      return response.data.results[0]; // <-- Thêm [0] ở đây!
    }

    // Rate limit
    if (response.status === 429) {
      if (attempt < MAX_RETRY) {
        const backoff = 30000 * attempt;
        console.log(`[RATE LIMIT] Location ${LOCATION_ID} -> chờ ${backoff / 1000}s (#${attempt + 1})`);
        await sleep(backoff);
        return fetchLocationData(attempt + 1);
      }
      console.log(`[RATE LIMIT] Location ${LOCATION_ID} -> quá số lần retry`);
      return null;
    }

    // Unauthorized
    if (response.status === 401) {
      console.log(`[ERROR] Location ${LOCATION_ID} -> API Key không hợp lệ`);
      return null;
    }

    throw new Error(`HTTP ${response.status}`);
    
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      if (attempt < MAX_RETRY) {
        const backoff = 5000 * attempt;
        console.log(`[WARN] Location ${LOCATION_ID} timeout -> retry ${backoff / 1000}s (#${attempt + 1})`);
        await sleep(backoff);
        return fetchLocationData(attempt + 1);
      }
    }
    throw error;
  }
}

/**
 * Transform OpenAQ v3 data sang schema HCMCAirIndex
 */
function transformToSchema(data) {
  if (!data) {
    throw new Error('No data to transform');
  }

  // Parse licenses từ API v3
  const licenses = (data.licenses || []).map(license => ({
    id: license.id || 0,
    name: license.name || '',
    attributionName: license.attribution?.name || '',
    attributionUrl: license.attribution?.url || '',
    dateFrom: license.dateFrom ? new Date(license.dateFrom) : undefined,
    dateTo: license.dateTo ? new Date(license.dateTo) : undefined
  }));

  const transformed = {
    _id: data.id,
    
    coordinates: {
      type: "Point",
      coordinates: [
        parseFloat(data.coordinates?.longitude) || 0,
        parseFloat(data.coordinates?.latitude) || 0
      ]
    },

    sensors: (data.sensors || []).map(s => ({
      id: s.id,
      key: s.parameter?.name || '',
      name: s.parameter?.displayName || s.name || '',
      displayName: s.parameter?.displayName || s.name || '',
      units: s.parameter?.units || ''
    })),

    datetimeFirst: {
      utc: data.datetimeFirst?.utc ? new Date(data.datetimeFirst.utc) : undefined,
      local: data.datetimeFirst?.local || undefined
    },

    datetimeLast: {
      utc: data.datetimeLast?.utc ? new Date(data.datetimeLast.utc) : new Date(),
      local: data.datetimeLast?.local || new Date().toISOString()
    },

    licenses: licenses
  };

  return transformed;
}

/**
 * Lưu hoặc cập nhật station vào database
 */
async function saveStation() {
  try {
    console.log(`[FETCH] Location ${LOCATION_ID}...`);
    
    // Fetch data từ API
    const locationData = await fetchLocationData();
    
    if (!locationData) {
      console.log(`[SKIP] Location ${LOCATION_ID} không có dữ liệu`);
      return;
    }

    // Transform data
    const stationData = transformToSchema(locationData);

    // Upsert vào database
    const result = await models.HCMCAirIndex.findOneAndUpdate(
      { _id: LOCATION_ID },
      stationData,
      { 
        upsert: true, 
        new: true, 
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    console.log(`[SAVE] Station ${LOCATION_ID} | ${result.sensors?.length || 0} sensors | coords: [${result.coordinates.coordinates.join(', ')}]`);
    
  } catch (error) {
    console.error(`[ERROR] Location ${LOCATION_ID}: ${error.message}`);
  }
}

/**
 * Chạy job
 */
async function runJob() {
  if (isRunning) {
    console.log('[INFO] Job trước chưa xong, bỏ qua tick.');
    return;
  }

  isRunning = true;
  try {
    await saveStation();
  } finally {
    isRunning = false;
  }
}

// Cron job
if (process.env.CRON_ENABLED === '1' || process.env.CRON_ENABLED === 'true') {
  cron.schedule(CRON_INTERVAL, () => {
    console.log(`[${new Date().toISOString()}] Cron tick -> runJob()`);
    runJob();
  });
  console.log(`[CRON] Enabled - schedule: ${CRON_INTERVAL}`);
} else {
  console.log('[CRON] Disabled (set CRON_ENABLED=1 to enable)');
}

// Chạy ngay khi start
runJob();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Received SIGTERM, exiting...');
  process.exit(0);
});