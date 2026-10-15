const express = require('express');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
