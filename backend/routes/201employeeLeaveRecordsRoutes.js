import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getAllEmployeesWithLeaveRecords,
  getLeaveRecordByEmployeeId,
  createLeaveRecord,
  updateLeaveRecord,
  deleteLeaveRecord,
  getCurrentUserLeaveEligibility
} from '../controllers/201employeeLeaveRecordsController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// GET /api/employee-leave-records - Get all employees with leave records
router.get('/', getAllEmployeesWithLeaveRecords);

// GET /api/employee-leave-records/eligibility/current - Get current user's leave eligibility
router.get('/eligibility/current', getCurrentUserLeaveEligibility);

// GET /api/employee-leave-records/:emp_objid - Get leave record by employee objid
router.get('/:emp_objid', getLeaveRecordByEmployeeId);

// POST /api/employee-leave-records - Create leave record
router.post('/', createLeaveRecord);

// PUT /api/employee-leave-records/:objid - Update leave record
router.put('/:objid', updateLeaveRecord);

// DELETE /api/employee-leave-records/:objid - Delete leave record
router.delete('/:objid', deleteLeaveRecord);

export default router;
