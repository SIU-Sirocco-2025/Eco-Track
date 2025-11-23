const dashboardRoute = require('./dashboard.route');
const aqiRoute = require('./aqi.route');
const weatherRoute = require('./weather.route');
const usersRoute = require('./users.route');
const userRoute = require('./user.route');


module.exports = (app) => {
    const PATH_ADMIN = app.locals.prefixAdmin; 
    app.use(PATH_ADMIN + '/dashboard', dashboardRoute);
    app.use(PATH_ADMIN + '/aqi', aqiRoute);
    app.use(PATH_ADMIN + '/weather', weatherRoute);
    app.use(PATH_ADMIN + '/users', usersRoute);
    app.use(PATH_ADMIN + '/user', userRoute);
};
