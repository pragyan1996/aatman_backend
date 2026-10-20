import authRoutes from './auth.routes.js';
import { Router } from 'express';
const router = Router();
import { getHealth } from '../controllers/health.controller.js';

router.get('/health', getHealth);
router.use('/auth', authRoutes);


export default router;
