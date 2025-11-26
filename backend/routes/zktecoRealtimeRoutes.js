import express from 'express';
import {
  startRealtimeListening,
  stopRealtimeListening,
  getListeningStatus,
  authenticateFromRealtimeLogin
} from '../controllers/zktecoRealtimeController.js';

const router = express.Router();

// Start real-time listening (public endpoint for login)
router.post('/start-listening', startRealtimeListening);

// Stop real-time listening
router.post('/stop-listening', stopRealtimeListening);

// Get listening status
router.get('/status', getListeningStatus);

// Authenticate from real-time login event (public endpoint for login)
router.post('/authenticate', authenticateFromRealtimeLogin);

export default router;
