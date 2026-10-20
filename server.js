import 'dotenv/config';
import app  from './src/app.js';
import { port } from './src/config/index.js';

const server = app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
