import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';
import {
  getCompanyInfo,
  updateCompanyInfo
} from '../controllers/companyController.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for original files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Make company info public (no authentication required)
router.get('/info', getCompanyInfo);
router.put('/info', protect, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'mayorEsig', maxCount: 1 },
  { name: 'hrmoEsig', maxCount: 1 },
  { name: 'treasurerEsig', maxCount: 1 },
  { name: 'bursarEsig', maxCount: 1 }
]), updateCompanyInfo);

export default router;