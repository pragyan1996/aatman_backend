import * as service from '../services/gallery.service.js';

export const upload = async (req, res) => {
  const images = await service.saveImages(req.files, req.user.id);
  res.status(201).json({ message: 'Images uploaded', images });
};

export const list = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ images: await service.listImages() });
};

export const remove = async (req, res) => {
  await service.deleteImage(req.params.id);
  res.status(204).end();
};
