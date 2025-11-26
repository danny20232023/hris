const express = require('express');
const router = express.Router();
const { getKioskConfig, saveKioskConfig, testNetworkMachine, getNetworkMachines } = require('../controllers/kioskController');
const { protect } = require('../middleware/authMiddleware');

// All kiosk routes require authentication
router.use(protect);

// Get kiosk configuration
router.get('/kiosk-config', getKioskConfig);

// Save kiosk configuration
router.post('/kiosk-config', saveKioskConfig);

// Test network machine connection
router.post('/machines/test-connection', testNetworkMachine);

// Get network machines
router.get('/machines/network', getNetworkMachines);

module.exports = router;
