// [GET] /admin/dashboard
module.exports.index = async (req, res) => {
    req.flash('success', 'Welcome to the Admin Dashboard!');
    res.render('admin/pages/dashboard', { title: 'Admin Dashboard' });
};
