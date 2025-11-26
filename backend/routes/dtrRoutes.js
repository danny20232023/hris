// backend/routes/dtrRoutes.js
import express from 'express';
import { getDtrLogs, getDtrLogsForLocatorForm } from '../controllers/dtrController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/dtr/logs?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (protected)
router.get('/logs', protect, getDtrLogs);
router.get('/logs/locator', protect, getDtrLogsForLocatorForm);

export default router;
