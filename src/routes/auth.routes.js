import authenticateAdmin from '../middlewares/adminAuth.middleware.js';
import { Router } from 'express';
const router = Router();
import { rateLimit } from 'express-rate-limit';
import { register, login, adminMe, adminLogout } from '../controllers/auth.controller.js';
import authenticate from '../middlewares/auth.middleware.js';
import validateRequest from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from '../validations/auth.validation.js';
import basicAuth from '../middlewares/basicAuth.middleware.js';

const limit = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, limit: max, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many authentication requests; try again later' },
});
// router.post('/request-otp', limit(10), controller.requestOtp);
// router.post('/verify-otp', limit(30), controller.verifyOtp);
// router.get('/me', authenticate, controller.me);
// router.patch('/me', authenticate, controller.updateMe);
// router.post('/logout', authenticate, controller.logout);

router.post('/register', limit(10), basicAuth, validateRequest({ body: registerSchema }), register);
router.post('/login', limit(20), basicAuth, validateRequest({ body: loginSchema }), login);
router.get('/me', authenticateAdmin, adminMe);
router.post('/logout', authenticateAdmin, adminLogout);
export default router;
