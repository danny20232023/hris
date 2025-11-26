import express from 'express';
import {
  getMachines,
  getMachinesSimple,
  getMachineById,
  addMachine,
  updateMachine,
  deleteMachine,
  getMachineLogs,
  getAllMachineLogs,
  syncMachineLogs,
  syncAllMachineLogs,
  getMachineStatus,
  getAllMachinesStatus,
  getMachineLogsFromDatabase,
  getAllMachineLogsFromDatabase,
  manualFetchMachineLogs,
  syncMachineLogsSSE,
  syncAllMachineLogsSSE,
  getMachinesDeviceInfo,
  testMachineConnection,
  syncMachineTime,
  uploadEmployeesToMachine,
  getNotUploadedEmployees,
  getMachineUsers,
  downloadEmployeeFromMachine,
  authenticateWithPin,
  testMachinesTable,
  // Add ZKTeco real-time listening imports
  startZKTecoRealtimeListening,
  stopZKTecoRealtimeListening,
  getZKTecoRealtimeStatus,
  authenticateZKTecoRealtimeLogin,
  debugMachinesConnectTypes,
  getLastZKTecoAuthResult
} from '../controllers/machineController.js';

const router = express.Router();

// Machine CRUD operations
router.get('/', getMachines);
router.post('/', addMachine);
router.post('/test-connection', testMachineConnection);

// ZKTeco Real-time Listening routes
router.post('/start-realtime-listening', startZKTecoRealtimeListening);
router.post('/stop-realtime-listening', stopZKTecoRealtimeListening);
router.get('/realtime-status', getZKTecoRealtimeStatus);
router.get('/realtime-last-auth', getLastZKTecoAuthResult);
router.post('/authenticate-realtime-login', authenticateZKTecoRealtimeLogin);
router.get('/debug-connect-types', debugMachinesConnectTypes);

// Specific routes (must come before parameterized routes)
router.get('/status/all', getAllMachinesStatus);
router.get('/device-info', getMachinesDeviceInfo);
router.get('/logs/all', getAllMachineLogs);
router.get('/logs/database/all', getAllMachineLogsFromDatabase);
router.post('/sync/all', syncAllMachineLogs);
router.get('/sync-all-sse', syncAllMachineLogsSSE);
router.get('/simple', getMachinesSimple);
router.post('/authenticate-pin', authenticateWithPin);
router.get('/test-table', testMachinesTable);

// Parameterized routes (must come after specific routes)
router.get('/:id', getMachineById);
router.put('/:id', updateMachine);
router.delete('/:id', deleteMachine);
router.get('/:id/logs', getMachineLogs);
router.get('/:id/status', getMachineStatus);
router.post('/:id/sync', syncMachineLogs);
router.get('/:id/logs/database', getMachineLogsFromDatabase);
router.post('/:id/fetch-logs', manualFetchMachineLogs);
router.get('/:id/sync-sse', syncMachineLogsSSE);
router.post('/:id/sync-time', syncMachineTime);
router.post('/:id/upload-employees', uploadEmployeesToMachine);
router.post('/:id/upload-employees-biometrics', uploadEmployeesToMachine);
router.get('/:id/not-uploaded-employees', getNotUploadedEmployees);
router.get('/:id/users', getMachineUsers);
router.post('/:id/download-employee', downloadEmployeeFromMachine);

export default router;
