import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getDashboard,
  getLocator,
  addLocator,
  updateLocator,
  deleteLocator,
  getShiftSchedules,
  addShiftSchedule,
  updateShiftSchedule,
  deleteShiftSchedule,
  assignShiftSchedule,
  getEmployees,
  getServerTime,
  getMonthlyTravelStats,
  getMonthlyLocatorStats,
} from '../controllers/managementController.js';

const router = express.Router();

// Dashboard
router.get('/dashboard', protect, getDashboard);

// Server Time
router.get('/server-time', protect, getServerTime);

// Calendar Monthly Stats
router.get('/calendar/monthly-stats/travel', protect, getMonthlyTravelStats);
router.get('/calendar/monthly-stats/locator', protect, getMonthlyLocatorStats);

// Locator (legacy - keeping for backward compatibility)
router.get('/locator', protect, getLocator);
router.post('/locator', protect, addLocator);
router.put('/locator/:userid/:checktime', protect, updateLocator);
router.delete('/locator/:userid/:checktime', protect, deleteLocator);

// Shift Schedules
router.get('/shiftschedules', protect, getShiftSchedules);
router.post('/shiftschedules', protect, addShiftSchedule);
router.put('/shiftschedules/:shiftNo', protect, updateShiftSchedule);
router.delete('/shiftschedules/:shiftNo', protect, deleteShiftSchedule);

// Employee Shift Assignment
router.post('/assign-shift-schedule', protect, assignShiftSchedule);

// Employees
router.get('/employees', protect, getEmployees);

export default router;