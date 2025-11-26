import express from 'express';
import { 
  healthCheck,
  captureFingerprintForEnrollment, 
  enrollFinger,
  saveEnrollment,
  getEnrollmentProgress,
  getEnrollmentStatus, 
  deleteEnrolledFinger,
  checkFingerAvailability
} from '../controllers/BioEnrollController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Bio Enrollment Routes
router.get('/health', healthCheck); // No auth required for health check
router.get('/check-finger/:userId/:fingerId', protect, checkFingerAvailability);
router.post('/capture-fingerprint', protect, captureFingerprintForEnrollment);
router.post('/enroll-finger', protect, enrollFinger); // Captures fingerprint, returns template for confirmation
router.post('/save-enrollment', protect, saveEnrollment); // Saves confirmed enrollment to database
router.get('/enrollment-progress/:enrollmentId', protect, getEnrollmentProgress);
router.get('/enrollment-status/:userId', protect, getEnrollmentStatus);
router.delete('/delete-finger/:userId/:fingerId', protect, deleteEnrolledFinger);

export default router;
