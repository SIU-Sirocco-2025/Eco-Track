const homeRoute = require('./home.route');
const aqiRoute = require('./aqi.route');
const userRoute = require('./auth.route');

module.exports = (app) => {
    app.use('/', homeRoute);
    app.use('/aqi', aqiRoute);
    app.use('/auth', userRoute);
};
