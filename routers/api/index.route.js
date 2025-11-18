const predictionRoute = require('./prediction.route');

module.exports = (app) => {
  const API_PREFIX = '/api';
  
  app.use(API_PREFIX + '/prediction', predictionRoute);
};