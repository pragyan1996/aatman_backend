import express, { json, urlencoded } from 'express';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/error.middleware.js';
import cors from './middlewares/cors.middleware.js';

const app = express();

app.use(cors);

app.use(json({ limit: '16kb' }));
app.use(urlencoded({ extended: false }));

app.use('/api/v1', routes);
app.use('/uploads', express.static('uploads', { maxAge: '7d', immutable: true }));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
