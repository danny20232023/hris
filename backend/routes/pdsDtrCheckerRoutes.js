import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getPDSForCurrentUser,
  savePDSForCurrentUser,
  getLookupData,
  getMissingFieldsForCurrentUser
} from '../controllers/pdsDtrCheckerController.js';

const router = express.Router();

// All routes are protected and operate on current user only
router.get('/me', protect, getPDSForCurrentUser);
router.post('/me', protect, savePDSForCurrentUser);
router.get('/lookup', protect, getLookupData);
router.get('/missing-fields', protect, getMissingFieldsForCurrentUser);

export default router;
