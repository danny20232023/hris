import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import {
  getPlantillaReport
} from '../controllers/201PlantillaReportsController.js';

const router = express.Router();

// All routes are protected - require authentication
// GET /api/201-plantilla-reports - Get plantilla of personnel report
router.get('/', protect, requirePermission('201-plantilla-reports', 'read'), getPlantillaReport);

export default router;

