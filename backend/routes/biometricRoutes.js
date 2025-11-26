import express from 'express';
import { getEmployeesBioStatus, getEnrolledFingers, deleteFinger } from '../controllers/biometricController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/employees-bio-status', protect, getEmployeesBioStatus);
router.get('/enrolled-fingers/:userId', protect, getEnrolledFingers);
router.delete('/delete-finger/:userId/:fingerId', protect, deleteFinger);

export default router;
