import { Router } from 'express';
import {
  listCdo,
  createCdo,
  updateCdo,
  updateCdoStatus,
  listUsedCdo,
  createUsedCdo,
  updateUsedCdo,
  updateUsedCdoStatus,
  deleteUsedCdo,
  deleteCdo,
  consumeCdo,
} from '../controllers/DTREmployeecdoController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// CDO Header routes
router.get('/transactions', protect, listCdo);
router.post('/transactions', protect, createCdo);
router.put('/transactions/:id', protect, updateCdo);
router.put('/transactions/:id/status', protect, updateCdoStatus);
router.delete('/transactions/:id', protect, deleteCdo);
router.post('/transactions/:id/consume', protect, consumeCdo);

// CDO Used routes
router.get('/usedates', protect, listUsedCdo);
router.post('/usedates', protect, createUsedCdo);
router.put('/usedates/:id', protect, updateUsedCdo);
router.put('/usedates/:id/status', protect, updateUsedCdoStatus);
router.delete('/usedates/:id', protect, deleteUsedCdo);

export default router;

