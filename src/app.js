import express, { json, urlencoded } from 'express';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(json({ limit: '16kb' }));
app.use(urlencoded({ extended: false }));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
