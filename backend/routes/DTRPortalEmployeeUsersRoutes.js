import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  listPortalEmployeeUsers,
  createPortalEmployeeUser,
  updatePortalEmployeeUser,
  deletePortalEmployeeUser,
  resetPortalEmployeeUserPin
} from '../controllers/DTRPortalEmployeeUsersController.js';

const router = express.Router();

router.use(protect);

router.get('/', listPortalEmployeeUsers);
router.post('/', createPortalEmployeeUser);
router.put('/:id', updatePortalEmployeeUser);
router.delete('/:id', deletePortalEmployeeUser);
router.post('/:id/reset-pin', resetPortalEmployeeUserPin);

export default router;

