import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/rbacMiddleware.js';
import {
  getHolidayTypes,
  getHolidayTypeById,
  createHolidayType,
  updateHolidayType,
  deleteHolidayType,
  getHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday
} from '../controllers/DTRHolidaysController.js';

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Holiday Types routes
router.get('/types', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'read');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, getHolidayTypes);

router.get('/types/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'read');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, getHolidayTypeById);

router.post('/types', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'create');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, createHolidayType);

router.put('/types/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'update');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, updateHolidayType);

router.delete('/types/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'delete');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, deleteHolidayType);

// Holidays routes
router.get('/', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'read');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, getHolidays);

router.get('/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'read');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, getHolidayById);

router.post('/', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'create');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, createHoliday);

router.put('/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'update');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, updateHoliday);

router.delete('/:id', async (req, res, next) => {
  try {
    await checkPermission(req, 'dtr-holidays', 'delete');
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
}, deleteHoliday);

export default router;
