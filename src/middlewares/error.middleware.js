exports.notFound = (req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

exports.errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.status || 500;
  console.error(error);
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : error.message,
  });
};
