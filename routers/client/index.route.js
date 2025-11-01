const homeRoute = require('./home.route');

module.exports = (app) => {
    app.use('/', homeRoute);
};
