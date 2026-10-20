export const notFound = (req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.status || 500;
  console.error('Request failed:', error.code || error.status || 'INTERNAL_ERROR');
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : error.message,
  });
};
