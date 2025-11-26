import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { list, getById, create, update, remove } from '../controllers/DTRShiftsController.js';

const router = express.Router();
router.use(protect);

router.get('/', requirePermission('dtr-shifts', 'read'), list);
router.get('/:id', requirePermission('dtr-shifts', 'read'), getById);
router.post('/', requirePermission('dtr-shifts', 'create'), create);
router.put('/:id', requirePermission('dtr-shifts', 'update'), update);
router.delete('/:id', requirePermission('dtr-shifts', 'delete'), remove);

export default router;


