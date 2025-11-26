import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
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

// All routes are protected
router.use(protect);

// @route   GET /api/compute-attendance/shift-schedules
// @desc    Get shift schedules for ComputeAttendance
// @access  Private
router.get('/shift-schedules', getShiftSchedules);

// @route   GET /api/compute-attendance/time-logs
// @desc    Get time logs for ComputeAttendance
// @access  Private
router.get('/time-logs', getTimeLogs);

// @route   GET /api/compute-attendance/employees
// @desc    Get employees for ComputeAttendance
// @access  Private
router.get('/employees', getEmployees);

// @route   GET /api/compute-attendance/departments
// @desc    Get departments for ComputeAttendance
// @access  Private
router.get('/departments', getDepartments);

// @route   POST /api/compute-attendance/calculate
// @desc    Calculate attendance metrics for ComputeAttendance
// @access  Private
router.post('/calculate', calculateAttendance);

// @route   GET /api/compute-attendance/check-computed-dtr
// @desc    Check which employees have computed DTR for given month/year/period
// @access  Private
router.get('/check-computed-dtr', checkComputedDtr);

// @route   GET /api/compute-attendance/check-all-periods
// @desc    Check which periods exist for given employees in a month/year
// @access  Private
router.get('/check-all-periods', checkAllPeriodsForEmployees);

export default router;
