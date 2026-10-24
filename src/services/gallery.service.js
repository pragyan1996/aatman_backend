import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pool from '../config/db.js';
import { httpError } from '../utils/auth.js';

export const GALLERY_DIR = path.resolve('uploads', 'gallery');

export const saveImages = async (files, adminId) => {
  if (!files?.length) throw httpError(400, 'Attach at least one image in the "images" field');
  await mkdir(GALLERY_DIR, { recursive: true });

  const saved = [];
  try {
    for (const file of files) {
      const fileName = `${randomUUID()}.webp`;          // never trust the client's file name
      try {
        await sharp(file.buffer)
          .rotate()                                      // fix iPhone orientation
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(path.join(GALLERY_DIR, fileName));     // throws if it isn't a real image
      } catch {
        throw httpError(400, `"${file.originalname}" is not a supported image`);
      }
      saved.push({ fileName, originalName: file.originalname.slice(0, 255), size: file.size });
    }

    const { rows } = await pool.query(
      `INSERT INTO gallery_images (file_name, original_name, size_bytes, uploaded_by)
       SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::bigint[])
       RETURNING id, file_name, created_at`,
      [saved.map(s => s.fileName), saved.map(s => s.originalName), saved.map(s => s.size),
       saved.map(() => adminId)],
    );
    return rows.map(toDto);
  } catch (error) {
    // all-or-nothing: remove files already written if anything failed
    await Promise.all(saved.map(s => unlink(path.join(GALLERY_DIR, s.fileName)).catch(() => {})));
    throw error;
  }
};

export const listImages = async () => {
  const { rows } = await pool.query(
    'SELECT id, file_name, created_at FROM gallery_images ORDER BY created_at DESC, id DESC');
  return rows.map(toDto);
};

export const deleteImage = async (id) => {
  const { rows: [row] } = await pool.query(
    'DELETE FROM gallery_images WHERE id = $1 RETURNING file_name', [id]);
  if (!row) throw httpError(404, 'Image not found');
  await unlink(path.join(GALLERY_DIR, row.file_name)).catch(() => {});
};

const toDto = (r) => ({ id: r.id, url: `/uploads/gallery/${r.file_name}`, createdAt: r.created_at });
