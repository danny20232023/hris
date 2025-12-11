import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import {
  getAllPlantilla,
  getPlantillaById,
  createPlantilla,
  updatePlantilla,
  deletePlantilla
} from '../controllers/201PlantillaController.js';

const router = express.Router();

// All routes are protected - require authentication
// GET /api/201-plantilla - List all plantilla records (with pagination, search, filters)
router.get('/', protect, requirePermission('201-plantilla', 'read'), getAllPlantilla);

// GET /api/201-plantilla/:id - Get single plantilla record by id (for view modal)
router.get('/:id', protect, requirePermission('201-plantilla', 'read'), getPlantillaById);

// POST /api/201-plantilla - Create new plantilla record
router.post('/', protect, requirePermission('201-plantilla', 'create'), createPlantilla);

// PUT /api/201-plantilla/:id - Update plantilla record
router.put('/:id', protect, requirePermission('201-plantilla', 'update'), updatePlantilla);

// DELETE /api/201-plantilla/:id - Delete plantilla record
router.delete('/:id', protect, requirePermission('201-plantilla', 'delete'), deletePlantilla);

export default router;

