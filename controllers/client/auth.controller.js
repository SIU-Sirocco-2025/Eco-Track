module.exports.login = (req, res) => {
    res.render('client/pages/auth/login.pug', { title: 'Đăng nhập' });
}