import { Router } from 'express';
import authenticateAdmin from '../middlewares/adminAuth.middleware.js';
import upload from '../middlewares/upload.middleware.js';
import { httpError } from '../utils/auth.js';
import * as controller from '../controllers/gallery.controller.js';

const router = Router();

router.get('/', controller.list);                                   // public
router.post('/', authenticateAdmin, upload, controller.upload);     // login check BEFORE upload
router.delete('/:id', authenticateAdmin, (req, res, next) =>
  /^\d+$/.test(req.params.id) ? next() : next(httpError(400, 'Invalid id')), controller.remove);

export default router;
