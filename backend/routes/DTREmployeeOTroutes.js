import { Router } from 'express';
import {
  listOTTransactions,
  getOTTransactionById,
  createOTTransaction,
  updateOTTransaction,
  updateOTTransactionStatus,
  deleteOTTransaction,
  listOTDates,
  createOTDate,
  updateOTDate,
  deleteOTDate,
  listOTTypes,
  listEmployeesWithOT,
  getDtrLogsForOt,
} from '../controllers/DTREmployeeOTController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// OT Transaction routes
router.get('/transactions', protect, listOTTransactions);
router.get('/transactions/:id', protect, getOTTransactionById);
router.post('/transactions', protect, createOTTransaction);
router.put('/transactions/:id', protect, updateOTTransaction);
router.put('/transactions/:id/status', protect, updateOTTransactionStatus);
router.delete('/transactions/:id', protect, deleteOTTransaction);

// OT Date routes
router.get('/dates', protect, listOTDates);
router.post('/dates', protect, createOTDate);
router.put('/dates/:id', protect, updateOTDate);
router.delete('/dates/:id', protect, deleteOTDate);

// Lookup routes
router.get('/types', protect, listOTTypes);
router.get('/employees', protect, listEmployeesWithOT);
router.get('/dtr-logs/:empObjId/:date', protect, getDtrLogsForOt);

export default router;

