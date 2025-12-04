// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

const NGSI_LD_CONTEXT = require('../config/ngsi-ld-context');

/**
 * Chuyển đổi AQI reading sang FIWARE AirQualityObserved + SOSA
 */
function toNGSILD(reading, districtKey) {
  if (!reading) return null;

  const timestamp = reading?.current?.pollution?.ts
    ? new Date(reading.current.pollution.ts).toISOString()
    : new Date().toISOString();

  const aqi = reading?.current?.pollution?.aqius ?? null;
  const coords = reading?.location?.coordinates || reading?.coordinates || [106.7, 10.78];

  const entityId = `urn:ngsi-ld:AirQualityObserved:${districtKey}`;
  const entity = {
    "@context": NGSI_LD_CONTEXT["@context"],
    "id": entityId,
    "type": "AirQualityObserved",

    // FIWARE core
    "dateObserved": { "type": "Property", "value": timestamp },
    "airQualityIndex": { "type": "Property", "value": aqi },

    // Pollutants (thêm nếu có trong reading)
    ...(reading.current?.pollution?.pm25 != null ? { "pm25": { "type": "Property", "value": reading.current.pollution.pm25 } } : {}),
    ...(reading.current?.pollution?.pm10 != null ? { "pm10": { "type": "Property", "value": reading.current.pollution.pm10 } } : {}),
    ...(reading.current?.pollution?.o3   != null ? { "o3":   { "type": "Property", "value": reading.current.pollution.o3 } } : {}),
    ...(reading.current?.pollution?.no2  != null ? { "no2":  { "type": "Property", "value": reading.current.pollution.no2 } } : {}),
    ...(reading.current?.pollution?.so2  != null ? { "so2":  { "type": "Property", "value": reading.current.pollution.so2 } } : {}),
    ...(reading.current?.pollution?.co   != null ? { "co":   { "type": "Property", "value": reading.current.pollution.co } } : {}),

    // Vị trí
    "location": {
      "type": "GeoProperty",
      "value": { "type": "Point", "coordinates": coords }
    },

    // Hành chính
    "city":   { "type": "Property", "value": reading.city || "Ho Chi Minh City" },
    "state":  { "type": "Property", "value": reading.state || "Ho Chi Minh City" },
    "country":{ "type": "Property", "value": reading.country || "Vietnam" },

    // SOSA links
    "observedProperty": { "type": "Property", "value": "Air Quality" },
    "hasFeatureOfInterest": {
      "type": "Relationship",
      "object": `urn:ngsi-ld:District:${districtKey}`
    }
  };

  return entity;
}

/**
 * Chuyển đổi mảng readings sang NGSI-LD
 */
function toNGSILDArray(readings, districtKey) {
  return readings
    .map(r => toNGSILD(r, districtKey))
    .filter(r => r !== null);
}

/**
 * Chuyển đổi prediction data sang NGSI-LD
 */
function predictionToNGSILD(prediction, districtKey) {
  const entityId = `urn:ngsi-ld:AQIPrediction:${districtKey}:${prediction.hour}`;
  
  return {
    "@context": "https://ecotrack.asia/context/v1",
    "id": entityId,
    "type": "AQIPrediction",
    
    "predictedAQI": {
      "type": "Property",
      "value": Math.round(prediction.aqius),
      "observedAt": new Date().toISOString()
    },
    "predictionHour": {
      "type": "Property",
      "value": prediction.hour
    },
    "quality": {
      "type": "Property",
      "value": prediction.quality
    },
    "timestamp": {
      "type": "Property",
      "value": prediction.timestamp
    },
    "district": {
      "type": "Relationship",
      "object": `urn:ngsi-ld:District:${districtKey}`
    }
  };
}

module.exports = {
  toNGSILD,
  toNGSILDArray,
  predictionToNGSILD,
  NGSI_LD_CONTEXT
};