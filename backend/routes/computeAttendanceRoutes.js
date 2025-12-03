import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import {
  getShiftSchedules,
  getTimeLogs,
  getEmployees,
  getDepartments,
  calculateAttendance,
  checkComputedDtr,
  checkAllPeriodsForEmployees
} from '../controllers/computeAttendanceController.js';

const router = express.Router();

// Component name for RBAC
const COMPONENT_NAME = 'compute-attendance';

// All routes are protected with RBAC
router.use(protect);

// @route   GET /api/compute-attendance/shift-schedules
// @desc    Get shift schedules for ComputeAttendance
// @access  Private - requires 'read' permission
router.get('/shift-schedules', requirePermission(COMPONENT_NAME, 'read'), getShiftSchedules);

// @route   GET /api/compute-attendance/time-logs
// @desc    Get time logs for ComputeAttendance
// @access  Private - requires 'read' permission
router.get('/time-logs', requirePermission(COMPONENT_NAME, 'read'), getTimeLogs);

// @route   GET /api/compute-attendance/employees
// @desc    Get employees for ComputeAttendance
// @access  Private - requires 'read' permission
router.get('/employees', requirePermission(COMPONENT_NAME, 'read'), getEmployees);

// @route   GET /api/compute-attendance/departments
// @desc    Get departments for ComputeAttendance
// @access  Private - requires 'read' permission
router.get('/departments', requirePermission(COMPONENT_NAME, 'read'), getDepartments);

// @route   POST /api/compute-attendance/calculate
// @desc    Calculate attendance metrics for ComputeAttendance
// @access  Private - requires 'create' permission
router.post('/calculate', requirePermission(COMPONENT_NAME, 'create'), calculateAttendance);

// @route   GET /api/compute-attendance/check-computed-dtr
// @desc    Check which employees have computed DTR for given month/year/period
// @access  Private - requires 'read' permission
router.get('/check-computed-dtr', requirePermission(COMPONENT_NAME, 'read'), checkComputedDtr);

// @route   GET /api/compute-attendance/check-all-periods
// @desc    Check which periods exist for given employees in a month/year
// @access  Private - requires 'read' permission
router.get('/check-all-periods', requirePermission(COMPONENT_NAME, 'read'), checkAllPeriodsForEmployees);

export default router;
