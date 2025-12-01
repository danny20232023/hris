import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  getMediaStorageConfig, 
  updateMediaStorageConfig, 
  validateMediaPath,
  getNetworkShareConfig,
  saveNetworkShareConfig,
  testNetworkShareConnection,
  getMediaFolders,
  addMediaFolder,
  updateMediaFolder,
  deleteMediaFolder
} from '../controllers/mediaStorageController.js';

const router = express.Router();

// Legacy routes (for backward compatibility)
router.get('/', protect, getMediaStorageConfig);
router.put('/', protect, updateMediaStorageConfig);
router.post('/validate', protect, validateMediaPath);

// Network share routes
router.get('/network-share', protect, getNetworkShareConfig);
router.post('/network-share', protect, saveNetworkShareConfig);
router.post('/test-connection', protect, testNetworkShareConnection);

// Folder management routes
router.get('/folders', protect, getMediaFolders);
router.post('/folders', protect, addMediaFolder);
router.put('/folders/:pathid', protect, updateMediaFolder);
router.delete('/folders/:pathid', protect, deleteMediaFolder);

export default router;
