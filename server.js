const app = require('./src/app');
const { port } = require('./src/config');

const server = app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
