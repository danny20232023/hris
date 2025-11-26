import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getAllComputedDtr,
  getComputedDtrById,
  getComputedDtrDetails,
  createComputedDtr,
  updateComputedDtr,
  deleteComputedDtr,
  getComputedDtrByEmployee
} from '../controllers/computedDTRController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/computed-dtr
// @desc    Get all computed DTR records with filters
// @access  Private
router.get('/', getAllComputedDtr);

// @route   GET /api/computed-dtr/employee/:empObjId
// @desc    Get computed DTR for specific employee with filters
// @access  Private
router.get('/employee/:empObjId', getComputedDtrByEmployee);

// @route   GET /api/computed-dtr/:id
// @desc    Get single computed DTR record by computeid
// @access  Private
router.get('/:id', getComputedDtrById);

// @route   GET /api/computed-dtr/:id/details
// @desc    Get all details records for a computeid
// @access  Private
router.get('/:id/details', getComputedDtrDetails);

// @route   POST /api/computed-dtr
// @desc    Create new computed DTR with details
// @access  Private
router.post('/', createComputedDtr);

// @route   PUT /api/computed-dtr/:id
// @desc    Update computed DTR and details
// @access  Private
router.put('/:id', updateComputedDtr);

// @route   DELETE /api/computed-dtr/:id
// @desc    Delete computed DTR and cascade delete details
// @access  Private
router.delete('/:id', deleteComputedDtr);

export default router;

