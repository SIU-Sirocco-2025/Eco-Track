const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/user.controller');
const { ensureAuth } = require('../../middlewares/auth.middleware');
router.get('/login', controller.login);

router.post('/login', controller.loginPost);

router.get('/register', controller.register);

router.post('/register', controller.registerPost);

router.get('/logout', controller.logout);

router.get('/settings', ensureAuth, controller.settings);
router.post('/settings/profile', ensureAuth, controller.updateProfile);
router.post('/settings/password', ensureAuth, controller.updatePassword);
module.exports = router;