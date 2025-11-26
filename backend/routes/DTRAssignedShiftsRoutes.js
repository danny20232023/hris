import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { list, getById, create, update, remove, bulkAssign } from '../controllers/DTRAssignedShiftController.js';

const router = express.Router();

router.get('/', protect, requirePermission('dtr-assign-shift', 'read'), list);
router.post('/bulk-assign', protect, requirePermission('dtr-assign-shift', 'create'), bulkAssign);
router.get('/:id', protect, requirePermission('dtr-assign-shift', 'read'), getById);
router.post('/', protect, requirePermission('dtr-assign-shift', 'create'), create);
router.put('/:id', protect, requirePermission('dtr-assign-shift', 'update'), update);
router.delete('/:id', protect, requirePermission('dtr-assign-shift', 'delete'), remove);

export default router;


