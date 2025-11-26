import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getAllEmployeesWithTransactions,
  getAllLeaveTransactions,
  getEmployeeTransactions,
  createLeaveTransaction,
  updateLeaveTransaction,
  deleteLeaveTransaction,
  getLeaveTypes,
  unapproveLeaveTransaction,
  validateLeaveLimitsEndpoint
} from '../controllers/201employeeLeaveTransactionsController.js';

const router = express.Router();

// Get all employees with transaction summary
router.get('/', protect, getAllEmployeesWithTransactions);

// Get all leave transactions with filters
router.get('/all', protect, getAllLeaveTransactions);

// Get transactions for specific employee
router.get('/:emp_objid', protect, getEmployeeTransactions);

// Validate leave limits
router.post('/validate', protect, validateLeaveLimitsEndpoint);

// Create new transaction
router.post('/', protect, createLeaveTransaction);

// Update transaction
router.put('/:objid', protect, updateLeaveTransaction);

// Unapprove transaction
router.put('/:objid/unapprove', protect, unapproveLeaveTransaction);

// Delete transaction
router.delete('/:objid', protect, deleteLeaveTransaction);

// Get all leave types
router.get('/leave-types/all', protect, getLeaveTypes);

export default router;
