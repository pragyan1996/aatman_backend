import multer from 'multer';
import { httpError } from '../utils/auth.js';

const uploader = multer({
  storage: multer.memoryStorage(),          // keep file in RAM; sharp processes it next
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
}).array('images', 10);                     // form field name = "images"

export default (req, res, next) => uploader(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(httpError(413, 'Each image must be 8MB or smaller'));
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return next(httpError(400, 'You can upload at most 10 images at a time'));
  }
  next(err);
});
