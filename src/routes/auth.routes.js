const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const limit = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, limit: max, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many authentication requests; try again later' },
});
router.post('/request-otp', limit(10), controller.requestOtp);
router.post('/verify-otp', limit(30), controller.verifyOtp);
router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, controller.updateMe);
router.post('/logout', authenticate, controller.logout);
module.exports = router;
