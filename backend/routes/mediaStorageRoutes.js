import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  getMediaStorageConfig, 
  updateMediaStorageConfig, 
  validateMediaPath 
} from '../controllers/mediaStorageController.js';

const router = express.Router();

router.get('/', protect, getMediaStorageConfig);
router.put('/', protect, updateMediaStorageConfig);
router.post('/validate', protect, validateMediaPath);

export default router;
