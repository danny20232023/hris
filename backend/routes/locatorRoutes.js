import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getLocators,
  addLocator,
  updateLocator,
  deleteLocator,
  getLocatorById,
  getLocatorCount,
  checkDuplicateLocator,
  getMonthlyLocatorStats
} from '../controllers/locatorController.js';

const router = express.Router();

// All routes are protected
router.get('/', protect, getLocators);
router.post('/', protect, addLocator);

// Specific routes must come before parameterized routes
router.get('/count', protect, getLocatorCount);
router.get('/check-duplicate', protect, checkDuplicateLocator);
router.get('/monthly-stats', protect, getMonthlyLocatorStats);

// Parameterized routes must come last
router.get('/:locNo', protect, getLocatorById);
router.put('/:locNo', protect, updateLocator);
router.delete('/:locNo', protect, deleteLocator);

export default router;