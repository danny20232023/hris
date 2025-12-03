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
import { requirePermission, requirePermissionForEither } from '../middleware/rbacMiddleware.js';

const router = Router();

// Component names for RBAC
const COMPONENT_NAME_EMPLOYEE = 'dtr-employee-ot'; // For Employee Overtimes tab
const COMPONENT_NAME_TRANSACTIONS = 'dtr-ot-transactions'; // For Transactions tab
const COMPONENT_NAME_COMPUTE = 'dtr-compute-ot'; // For Compute Overtime tab

// OT Transaction routes - RBAC protected (used by both Transactions and Compute Overtime tabs)
router.get('/transactions', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), listOTTransactions);
router.get('/transactions/:id', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), getOTTransactionById);
router.post('/transactions', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'create'), createOTTransaction);
router.put('/transactions/:id', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'update'), updateOTTransaction);
router.put('/transactions/:id/status', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'approve'), updateOTTransactionStatus);
router.delete('/transactions/:id', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'delete'), deleteOTTransaction);

// OT Date routes - RBAC protected (used by both Transactions and Compute Overtime tabs)
router.get('/dates', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), listOTDates);
router.post('/dates', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'create'), createOTDate);
router.put('/dates/:id', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'update'), updateOTDate);
router.delete('/dates/:id', protect, requirePermission(COMPONENT_NAME_TRANSACTIONS, 'delete'), deleteOTDate);

// Lookup routes - RBAC protected (read permission for lookups)
// These are used by Employee Overtimes, Transactions, and Compute Overtime tabs
router.get('/types', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), listOTTypes);
router.get('/employees', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), listEmployeesWithOT);
router.get('/dtr-logs/:empObjId/:date', protect, requirePermissionForEither(COMPONENT_NAME_TRANSACTIONS, COMPONENT_NAME_COMPUTE, 'read'), getDtrLogsForOt);

export default router;

