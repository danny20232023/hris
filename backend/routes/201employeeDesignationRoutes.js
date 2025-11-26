import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  listDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  listRanks,
  listAppointmentTypes,
} from '../controllers/201employeeDesignationController.js';

const router = express.Router();

router.get('/ranks', protect, listRanks);
router.get('/appointment-types', protect, listAppointmentTypes);

router.get('/', protect, listDesignations);
router.get('/:objid', protect, getDesignation);
router.post('/', protect, createDesignation);
router.put('/:objid', protect, updateDesignation);
router.delete('/:objid', protect, deleteDesignation);

export default router;


