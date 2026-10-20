const router = require('express').Router();
const { getHealth } = require('../controllers/health.controller');

router.get('/health', getHealth);
router.use('/auth', require('./auth.routes'));

module.exports = router;
