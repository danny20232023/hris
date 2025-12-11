import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import {
  getAllTranches,
  getTrancheById,
  createTranche,
  updateTranche,
  deleteTranche,
  getTrancheRates,
  saveTrancheRates,
  updateTrancheRate,
  deleteTrancheRate,
  getRateByTrancheAndGrade,
  getSalaryClasses
} from '../controllers/201PlantillaTranchesController.js';

const router = express.Router();

// All routes are protected - require authentication
// GET /api/201-plantilla-tranches/salary-classes - Get all salary classes
router.get('/salary-classes', protect, requirePermission('201-plantilla-rates', 'read'), getSalaryClasses);

// GET /api/201-plantilla-tranches - List all tranches (with pagination, search, filters)
router.get('/', protect, requirePermission('201-plantilla-tranches', 'read'), getAllTranches);

// GET /api/201-plantilla-tranches/:id - Get single tranche by id
router.get('/:id', protect, requirePermission('201-plantilla-tranches', 'read'), getTrancheById);

// POST /api/201-plantilla-tranches - Create new tranche
router.post('/', protect, requirePermission('201-plantilla-tranches', 'create'), createTranche);

// PUT /api/201-plantilla-tranches/:id - Update tranche
router.put('/:id', protect, requirePermission('201-plantilla-tranches', 'update'), updateTranche);

// DELETE /api/201-plantilla-tranches/:id - Delete tranche
router.delete('/:id', protect, requirePermission('201-plantilla-tranches', 'delete'), deleteTranche);

// GET /api/201-plantilla-tranches/:trancheId/rates - Get all rates for a tranche
router.get('/:trancheId/rates', protect, requirePermission('201-plantilla-rates', 'read'), getTrancheRates);

// GET /api/201-plantilla-tranches/:trancheId/rates/:salarygrade/:stepincrement - Get specific rate
router.get('/:trancheId/rates/:salarygrade/:stepincrement', protect, requirePermission('201-plantilla-rates', 'read'), getRateByTrancheAndGrade);

// POST /api/201-plantilla-tranches/:trancheId/rates - Create/update rates for a tranche
router.post('/:trancheId/rates', protect, requirePermission('201-plantilla-rates', 'create'), saveTrancheRates);

// PUT /api/201-plantilla-tranches/:trancheId/rates/:rateId - Update single rate
router.put('/:trancheId/rates/:rateId', protect, requirePermission('201-plantilla-rates', 'update'), updateTrancheRate);

// DELETE /api/201-plantilla-tranches/:trancheId/rates/:rateId - Delete single rate
router.delete('/:trancheId/rates/:rateId', protect, requirePermission('201-plantilla-rates', 'delete'), deleteTrancheRate);

export default router;

