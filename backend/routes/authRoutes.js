// routes/authRoutes.js
import express from 'express';
import { getDb } from '../config/db.js';
import sql from 'mssql';
import multer from 'multer';

import { login, register, verifyPassword, changePin, verifyPin, changePassword, biometricLogin, biometricLoginDirect, verifyFingerprint, getDigitalPersonaStatus, getDigitalPersonaDevices, captureFingerprint, getUserPermissions, uploadUserPhoto, createPortalSessionFromAdmin, createAdminSessionFromPortal, checkAdminAccess } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const router = express.Router();
router.post('/login', login);
router.post('/register', register);
router.post('/verify-password', protect, verifyPassword);
router.get('/check-admin-access', protect, checkAdminAccess);
router.get('/permissions', protect, getUserPermissions);
router.post('/upload-photo', protect, upload.single('photo'), uploadUserPhoto);
router.post('/admin/portal-session', protect, createPortalSessionFromAdmin);
router.post('/portal/admin-session', protect, createAdminSessionFromPortal);

// SSN Change Routes
router.post('/change-pin', protect, changePin);
router.post('/verify-pin', protect, verifyPin);

// Password Change Route
router.post('/change-password', protect, changePassword);

// Biometric authentication routes
router.post('/biometric-login', biometricLogin);           // Web-based fingerprint verification
router.post('/biometric-login-direct', biometricLoginDirect);  // Direct PowerShell SDK fingerprint capture & verification
router.post('/verify-fingerprint', verifyFingerprint);     // Legacy verification

// Native DigitalPersona SDK routes (will return disabled message if ENABLE_DIGITALPERSONA=false)
router.get('/digitalpersona-status', getDigitalPersonaStatus);
router.get('/digitalpersona-devices', getDigitalPersonaDevices);
router.post('/capture-fingerprint', captureFingerprint);


export default router;
