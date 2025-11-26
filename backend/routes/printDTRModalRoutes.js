import express from 'express';
import {
  searchEmployees,
  getRecords,
  getRecordById,
  createRecord,
  updateRecord,
  deleteRecord
} from '../controllers/printDTRModalController.js';

const router = express.Router();

router.get('/employees', searchEmployees);
router.get('/records', getRecords);
router.get('/records/:userId/:checkTime', getRecordById);
router.post('/records', createRecord);
router.put('/records/:userId/:checkTime', updateRecord);
router.delete('/records/:userId/:checkTime', deleteRecord);

export default router;

