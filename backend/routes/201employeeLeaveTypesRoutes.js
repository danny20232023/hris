// backend/routes/employeeLeaveTypesRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getAllLeaveTypes,
  getLeaveTypeById,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  getQuestionsByLeaveType,
  addQuestion,
  updateQuestion,
  deleteQuestion
} from '../controllers/201employeeLeaveTypeController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Leave Types CRUD routes
router.get('/', getAllLeaveTypes);
router.get('/:id', getLeaveTypeById);
router.post('/', createLeaveType);
router.put('/:id', updateLeaveType);
router.delete('/:id', deleteLeaveType);

// Questions management routes
router.get('/:id/questions', getQuestionsByLeaveType);
router.post('/:id/questions', addQuestion);
router.put('/questions/:objid', updateQuestion);
router.delete('/questions/:objid', deleteQuestion);

export default router;
