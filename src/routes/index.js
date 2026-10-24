import authRoutes from './auth.routes.js';
import galleryRoutes from './gallery.routes.js';
import { Router } from 'express';
const router = Router();
import { getHealth } from '../controllers/health.controller.js';

router.get('/health', getHealth);
router.use('/auth', authRoutes);
router.use('/gallery', galleryRoutes);

module.exports = router;
