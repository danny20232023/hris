import sql from 'mssql';
import { getDb } from '../config/db.js';
import { 
  fetchTimeLogsFromMachine, 
  fetchTimeLogsFromAllMachines, 
  saveLogsToCHECKINOUT, 
  fetchLogsWithEmployeeNames, 
  ProgressTracker,
  fetchMachineLogsManually,
  getUserIdFromBadgeNumber,
  checkLogExists,
  getUsersFromMachine
} from '../utils/zktecoSDK.js';
// ZKTecoNativeSDK imported dynamically to handle edge-js gracefully (Windows-only dependency)
import ZKLib from 'node-zklib';
import jwt from 'jsonwebtoken';

// Helper function to get machine by ID (without Express req/res)
const getMachineByIdHelper = async (machineId) => {
  try {
    const pool = await getDb();
    
    // Convert machineId to integer to ensure it's a valid number
    const id = parseInt(machineId, 10);
    
    // Validate that the conversion was successful
    if (isNaN(id)) {
      throw new Error(`Invalid machine ID: ${machineId}`);
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT * FROM Machines 
        WHERE ID = @id
      `);
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching machine by ID:', error);
    throw error;
  }
};

// GET /api/machines - Get all biometric machines
export const getMachines = async (req, res) => {
  try {
    const pool = await getDb();
    const result = await pool.request().query(`
      SELECT 
        ID,
        MachineAlias,
        ConnectType,
        IP,
        SerialPort,
        Port,
        Baudrate,
        MachineNumber,
        IsHost,
        Enabled,
        CommPassword,
        UILanguage,
        DateFormat,
        InOutRecordWarn,
        Idle,
        Voice,
        managercount,
        usercount,
        fingercount,
        SecretCount,
        FirmwareVersion,
        ProductType,
        LockControl,
        Purpose,
        ProduceKind,
        sn,
        PhotoStamp,
        IsIfChangeConfigServer2,
        IsAndroid
      FROM Machines
      WHERE Enabled = 1
      ORDER BY MachineAlias
    `);
    
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching machines'
    });
  }
};

// GET /api/machines/:id - Get specific machine details
export const getMachineById = async (req, res) => {
  try {
    const machine = await getMachineByIdHelper(req.params.id);
    
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    res.json({
      success: true,
      data: machine
    });
  } catch (error) {
    console.error('Error in getMachineById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching machine'
    });
  }
};

// POST /api/machines - Add new machine
export const addMachine = async (req, res) => {
  try {
    const {
      id,
      name,
      connectionType,
      ipAddress,
      serialPort,
      port,
      baudrate,
      commPassword,
      machine
    } = req.body;
    
    const pool = await getDb();
    
    // Check for conflicts before inserting
    const conflictCheck = await pool.request()
      .input('IP', sql.VarChar(20), ipAddress)
      .input('MachineNumber', sql.Int, parseInt(machine))
      .input('ID', sql.Int, parseInt(id))
      .query(`
        SELECT 
          CASE WHEN EXISTS(SELECT 1 FROM Machines WHERE IP = @IP) THEN 'IP' ELSE NULL END as IPConflict,
          CASE WHEN EXISTS(SELECT 1 FROM Machines WHERE MachineNumber = @MachineNumber) THEN 'MachineNumber' ELSE NULL END as MachineNumberConflict,
          CASE WHEN EXISTS(SELECT 1 FROM Machines WHERE ID = @ID) THEN 'ID' ELSE NULL END as IDConflict
      `);
    
    const conflicts = [];
    const result = conflictCheck.recordset[0];
    
    if (result.IPConflict) {
      conflicts.push('IP Address');
    }
    if (result.MachineNumberConflict) {
      conflicts.push('Machine Number');
    }
    if (result.IDConflict) {
      conflicts.push('ID');
    }
    
    if (conflicts.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following fields already exist: ${conflicts.join(', ')}. Please use different values.`,
        conflicts: conflicts
      });
    }
    
    // If no conflicts, proceed with insertion
    const insertResult = await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .input('MachineAlias', sql.VarChar(20), name)
      .input('ConnectType', sql.Int, connectionType)
      .input('IP', sql.VarChar(20), ipAddress)
      .input('SerialPort', sql.Int, serialPort)
      .input('Port', sql.Int, port)
      .input('Baudrate', sql.Int, baudrate)
      .input('MachineNumber', sql.Int, parseInt(machine))
      .input('IsHost', sql.Bit, 0)
      .input('Enabled', sql.Bit, 1)
      .input('CommPassword', sql.VarChar(12), commPassword.toString())
      .input('UILanguage', sql.SmallInt, 0)
      .input('DateFormat', sql.SmallInt, 0)
      .input('InOutRecordWarn', sql.SmallInt, 0)
      .input('Idle', sql.SmallInt, 0)
      .input('Voice', sql.SmallInt, 0)
      .input('managercount', sql.SmallInt, 0)
      .input('usercount', sql.SmallInt, 0)
      .input('fingercount', sql.SmallInt, 0)
      .input('SecretCount', sql.SmallInt, 0)
      .input('FirmwareVersion', sql.VarChar(20), '')
      .input('ProductType', sql.VarChar(20), '')
      .input('LockControl', sql.SmallInt, 0)
      .input('Purpose', sql.SmallInt, 0)
      .input('ProduceKind', sql.Int, 0)
      .input('sn', sql.VarChar(20), '')
      .input('PhotoStamp', sql.VarChar(20), '')
      .input('IsIfChangeConfigServer2', sql.Int, 0)
      .input('IsAndroid', sql.VarChar(1), '0')
      .query(`
        INSERT INTO Machines (
          ID, MachineAlias, ConnectType, IP, SerialPort, Port, Baudrate, 
          MachineNumber, IsHost, Enabled, CommPassword, UILanguage, 
          DateFormat, InOutRecordWarn, Idle, Voice, managercount, 
          usercount, fingercount, SecretCount, FirmwareVersion, 
          ProductType, LockControl, Purpose, ProduceKind, sn, 
          PhotoStamp, IsIfChangeConfigServer2, IsAndroid
        ) VALUES (
          @ID, @MachineAlias, @ConnectType, @IP, @SerialPort, @Port, @Baudrate,
          @MachineNumber, @IsHost, @Enabled, @CommPassword, @UILanguage,
          @DateFormat, @InOutRecordWarn, @Idle, @Voice, @managercount,
          @usercount, @fingercount, @SecretCount, @FirmwareVersion,
          @ProductType, @LockControl, @Purpose, @ProduceKind, @sn,
          @PhotoStamp, @IsIfChangeConfigServer2, @IsAndroid
        )
      `);
    
    res.json({
      success: true,
      message: 'Machine registered successfully'
    });
  } catch (error) {
    console.error('Error adding machine:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding machine: ' + error.message
    });
  }
};

// PUT /api/machines/:id - Update machine
export const updateMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const pool = await getDb();
    
    // Build dynamic update query
    const updateFields = [];
    const request = pool.request().input('id', sql.Int, id);
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        updateFields.push(`${key} = @${key}`);
        request.input(key, updateData[key]);
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    const query = `
      UPDATE Machines 
      SET ${updateFields.join(', ')}
      WHERE ID = @id
    `;
    
    await request.query(query);
    
    res.json({
      success: true,
      message: 'Machine updated successfully'
    });
  } catch (error) {
    console.error('Error updating machine:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating machine'
    });
  }
};

// DELETE /api/machines/:id - Delete machine
export const deleteMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getDb();
    
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Machines WHERE ID = @id');
    
    res.json({
      success: true,
      message: 'Machine deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting machine:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting machine'
    });
  }
};

// GET /api/machines/:id/logs - Fetch time logs from specific machine
export const getMachineLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const pool = await getDb();
    
    // Get machine details
    const machineResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Machines WHERE ID = @id AND Enabled = 1');
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found or disabled'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Create progress tracker for debugging
    const progressTracker = new ProgressTracker();
    
    // Fetch time logs from machine with progress tracking
    const result = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
    
    res.json({
      success: true,
      data: {
        logs: result,
        totalLogs: result.length,
        dateRange: { startDate, endDate },
        machineId: machine.ID,
        machineAlias: machine.MachineAlias
      }
    });
  } catch (error) {
    console.error('Error fetching machine logs:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching machine logs: ${error.message}`
    });
  }
};

// GET /api/machines/logs/all - Fetch time logs from all machines
export const getAllMachineLogs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const pool = await getDb();
    
    // Get all enabled machines
    const machinesResult = await pool.request().query(`
      SELECT * FROM Machines 
      WHERE Enabled = 1 
      ORDER BY MachineAlias
    `);
    
    const machines = machinesResult.recordset;
    
    if (machines.length === 0) {
      return res.json({
        success: true,
        data: {
          results: [],
          totalMachines: 0,
          totalLogs: 0,
          dateRange: { startDate, endDate }
        }
      });
    }
    
    // Fetch time logs from all machines
    const results = await fetchTimeLogsFromAllMachines(machines, startDate, endDate);
    
    // Calculate totals
    const totalLogs = results.reduce((sum, result) => sum + (result.totalLogs || 0), 0);
    const successfulMachines = results.filter(result => result.success).length;
    
    res.json({
      success: true,
      data: {
        results,
        totalMachines: machines.length,
        successfulMachines,
        totalLogs,
        dateRange: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Error fetching all machine logs:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching all machine logs: ${error.message}`
    });
  }
};

// POST /api/machines/:id/sync - Enhanced sync with progress tracking and CHECKINOUT saving
export const syncMachineLogs = async (req, res) => {
  try {
    const { machineId, startDate, endDate, testMode = false } = req.body;
    
    if (!machineId || !startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Machine ID, start date, and end date are required' 
      });
    }

    // Get machine details using the helper function
    const machine = await getMachineByIdHelper(machineId);
    if (!machine) {
      return res.status(404).json({ 
        success: false, 
        message: 'Machine not found' 
      });
    }

    // Create progress tracker
    const progressTracker = new ProgressTracker();
    progressTracker.progress.totalSteps = 3; // Connect, Fetch, Save

    try {
      let logs = [];
      
      if (testMode) {
        // Generate test logs for testing purposes
        progressTracker.nextStep('Test Mode', 'Generating test logs for demonstration', 'Creating sample data');
        const pool = await getDb();
        logs = await generateTestLogs(machine, startDate, endDate, pool);
        progressTracker.nextStep('Test Logs Generated', `Generated ${logs.length} test logs`, 'Ready for processing');
      } else {
        // Fetch logs from actual machine
        logs = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
      }
      
      if (logs.length === 0) {
        const message = testMode ? 'No test logs generated' : 'No logs found for the specified date range';
        return res.json({
          success: true,
          message: message,
          data: {
            logs: [],
            totalLogs: 0,
            saved: 0
          }
        });
      }

      // Save logs to database
      progressTracker.nextStep('Saving', `Saving ${logs.length} logs to database`, 'Writing to CHECKINOUT table');
      const saveResult = await saveLogsToCHECKINOUT(logs, progressTracker);
      
      progressTracker.nextStep('Completed', `Successfully processed ${logs.length} logs`, 'Sync completed');

      // Return success response
      res.json({
        success: true,
        message: `Successfully synced ${logs.length} logs from ${machine.MachineAlias}`,
        data: {
          logs: logs,
          totalLogs: logs.length,
          saved: saveResult.count || 0,
          machineAlias: machine.MachineAlias
        }
      });

    } catch (syncError) {
      console.error('Error in sync process:', syncError);
      progressTracker.addError(`Sync failed: ${syncError.message}`);
      
      res.status(500).json({
        success: false,
        message: 'Failed to sync machine logs',
        error: syncError.message
      });
    }

  } catch (error) {
    console.error('Error in syncMachineLogs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// POST /api/machines/sync/all - Sync all machines with progress tracking
export const syncAllMachineLogs = async (req, res) => {
  const progressTracker = new ProgressTracker();
  
  // Set up Server-Sent Events for progress updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to bulk sync process"}\n\n');

  // Set up progress callback
  progressTracker.onProgress((progress) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
  });

  try {
    const { startDate, endDate, saveToDatabase = true } = req.body;
    
    // Default to today if no dates provided
    const syncStartDate = startDate || new Date().toISOString().split('T')[0];
    const syncEndDate = endDate || new Date().toISOString().split('T')[0];
    
    const pool = await getDb();
    
    // Get all enabled machines
    const machinesResult = await pool.request().query(`
      SELECT * FROM Machines 
      WHERE Enabled = 1 
      ORDER BY MachineAlias
    `);
    
    const machines = machinesResult.recordset;
    
    if (machines.length === 0) {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        message: 'No enabled machines found',
        data: { results: [], totalMachines: 0, totalLogs: 0 }
      })}\n\n`);
      res.end();
      return;
    }
    
    // Fetch time logs from all machines
    const results = await fetchTimeLogsFromAllMachines(machines, syncStartDate, syncEndDate, progressTracker);
    
    // Save logs to database if requested
    let totalSaved = 0;
    let totalErrors = 0;
    
    if (saveToDatabase) {
      progressTracker.nextStep('Saving All Logs', 'Saving logs from all machines to database', 'Processing...');
      
      for (const result of results) {
        if (result.success && result.logs.length > 0) {
          const saveResult = await saveLogsToCHECKINOUT(result.logs, pool, progressTracker);
          totalSaved += saveResult.saved;
          totalErrors += saveResult.errors;
        }
      }
    }
    
    // Calculate totals
    const totalLogs = results.reduce((sum, result) => sum + (result.totalLogs || 0), 0);
    const successfulMachines = results.filter(result => result.success).length;
    
    // Send final result
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      message: `Bulk sync completed for ${successfulMachines}/${machines.length} machines`,
      data: {
        results,
        totalMachines: machines.length,
        successfulMachines,
        totalLogs,
        totalSaved,
        totalErrors,
        dateRange: { startDate: syncStartDate, endDate: syncEndDate }
      }
    })}\n\n`);
    
  } catch (error) {
    console.error('Error syncing all machine logs:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: `Error syncing all machine logs: ${error.message}`
    })}\n\n`);
  } finally {
    res.end();
  }
};

// GET /api/machines/:id/status - Check machine connection status
export const getMachineStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getDb();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Machines WHERE ID = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    const machine = result.recordset[0];
    
    // Import the ZKTecoConnection class for ping testing
    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    
    // Create a connection instance for ping testing
    const connection = new ZKTecoConnection(machine);
    
    // Test the connection with ping
    let isOnline = false;
    let pingTime = null;
    let errorMessage = null;
    
    try {
      const startTime = Date.now();
      isOnline = await connection.testConnection();
      pingTime = Date.now() - startTime;
      
      // Consider device offline if ping time is above 1000ms
      if (pingTime > 1000) {
        isOnline = false;
        errorMessage = `High latency: ${pingTime}ms (threshold: 1000ms)`;
      }
    } catch (error) {
      console.error(`Ping test failed for machine ${machine.MachineAlias}:`, error);
      errorMessage = error.message;
      isOnline = false;
    }
    
    res.json({
      success: true,
      data: {
        id: machine.ID,
        alias: machine.MachineAlias,
        ip: machine.IP,
        port: machine.Port,
        enabled: machine.Enabled,
        status: isOnline ? 'online' : 'offline',
        pingTime: pingTime,
        errorMessage: errorMessage,
        lastChecked: new Date().toISOString(),
        userCount: machine.usercount,
        fingerCount: machine.fingercount,
        firmwareVersion: machine.FirmwareVersion
      }
    });
  } catch (error) {
    console.error('Error checking machine status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking machine status'
    });
  }
};

// GET /api/machines/status/all - Check status of all machines
export const getAllMachinesStatus = async (req, res) => {
  try {
    const pool = await getDb();
    
    // Get all enabled machines
    const result = await pool.request().query(`
      SELECT * FROM Machines 
      WHERE Enabled = 1 
      ORDER BY MachineAlias
    `);
    
    const machines = result.recordset;
    
    if (machines.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Import the ZKTecoConnection class for ping testing
    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    
    // Test all machines concurrently
    const statusPromises = machines.map(async (machine) => {
      const connection = new ZKTecoConnection(machine);
      
      let isOnline = false;
      let pingTime = null;
      let errorMessage = null;
      
      try {
        const startTime = Date.now();
        isOnline = await connection.testConnection();
        pingTime = Date.now() - startTime;
        
        // Consider device offline if ping time is above 1000ms
        if (pingTime > 1000) {
          isOnline = false;
          errorMessage = `High latency: ${pingTime}ms (threshold: 1000ms)`;
        }
      } catch (error) {
        console.error(`Ping test failed for machine ${machine.MachineAlias}:`, error);
        errorMessage = error.message;
        isOnline = false;
      }
      
      return {
        id: machine.ID,
        alias: machine.MachineAlias,
        ip: machine.IP,
        port: machine.Port,
        enabled: machine.Enabled,
        status: isOnline ? 'online' : 'offline',
        pingTime: pingTime,
        errorMessage: errorMessage,
        lastChecked: new Date().toISOString(),
        userCount: machine.usercount,
        fingerCount: machine.fingercount,
        firmwareVersion: machine.FirmwareVersion
      };
    });
    
    // Wait for all ping tests to complete
    const statusResults = await Promise.all(statusPromises);
    
    res.json({
      success: true,
      data: statusResults
    });
    
  } catch (error) {
    console.error('Error checking all machines status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking machines status'
    });
  }
};

// GET /api/machines/:id/logs/database - Fetch logs from CHECKINOUT table with employee names
export const getMachineLogsFromDatabase = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const pool = await getDb();
    
    // Get machine details to verify it exists
    const machineResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Machines WHERE ID = @id AND Enabled = 1');
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found or disabled'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Fetch logs from CHECKINOUT table with employee names
    const logs = await fetchLogsWithEmployeeNames(pool, startDate, endDate, id);
    
    res.json({
      success: true,
      data: {
        logs,
        machine: {
          id: machine.ID,
          alias: machine.MachineAlias,
          ip: machine.IP
        },
        totalLogs: logs.length,
        dateRange: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Error fetching machine logs from database:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching machine logs from database: ${error.message}`
    });
  }
};

// GET /api/machines/logs/database/all - Fetch all logs from CHECKINOUT table with employee names
export const getAllMachineLogsFromDatabase = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const pool = await getDb();
    
    // Fetch logs from CHECKINOUT table with employee names for all machines
    const logs = await fetchLogsWithEmployeeNames(pool, startDate, endDate);
    
    res.json({
      success: true,
      data: {
        logs,
        totalLogs: logs.length,
        dateRange: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Error fetching all machine logs from database:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching all machine logs from database: ${error.message}`
    });
  }
};

// GET /api/machines/:id/manual-fetch - Manual fetch logs from machine (view only, no database save)
export const manualFetchMachineLogs = async (req, res) => {
  const progressTracker = new ProgressTracker();
  
  // Set up Server-Sent Events for progress updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to preview logs process"}\n\n');

  // Set up progress callback
  progressTracker.onProgress((progress) => {
    console.log('[SSE] Sending preview progress update:', progress);
    const progressData = { type: 'progress', ...progress };
    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
  });

  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Start date and end date are required'
      })}\n\n`);
      res.end();
      return;
    }
    
    // Get machine details
    const machine = await getMachineByIdHelper(id);
    if (!machine) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Machine not found'
      })}\n\n`);
      res.end();
      return;
    }

    try {
      let logs = [];
      let totalLogsFound = 0;
      let totalLogsProcessed = 0;
      let newLogsCount = 0;
      
      // Step 1: Connecting to device
      progressTracker.updateProgress(0, 'Connecting', `Connecting to ${machine.MachineAlias}`, `IP: ${machine.IP}:${machine.Port}`, 0, 0, 0);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Count total logs on machine
      progressTracker.updateProgress(0, 'Counting Logs', 'Counting total logs on machine', 'Please wait...', 0, 0, 0);
      
      const { fetchTimeLogsFromMachine, getUserIdFromBadgeNumber, checkLogExists } = await import('../utils/zktecoSDK.js');
      const pool = await getDb();
      
      // Fetch all logs from machine and store in temporary array
      const tempLogsArray = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
      totalLogsFound = tempLogsArray.length;
      
      if (totalLogsFound === 0) {
        progressTracker.setComplete('No logs found for the specified date range', 0, 0, 0);
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          success: true,
          message: 'No logs found for the specified date range',
          data: {
            logs: [],
            totalLogs: 0,
            newLogs: 0,
            duplicates: 0
          }
        })}\n\n`);
        res.end();
        return;
      }

      progressTracker.updateProgress(0, 'Processing', `Found ${totalLogsFound} logs`, 'Starting to process logs...', totalLogsFound, 0, 0);

      // Step 3: Process logs one by one with duplicate checking
      let processedCount = 0;
      let newLogs = [];
      let duplicateCount = 0;
      let skippedCount = 0;
      const unregisteredEmployees = [];

      for (let i = 0; i < tempLogsArray.length; i++) {
        const log = tempLogsArray[i];
        
        // Update progress for individual log processing
        progressTracker.updateProgress(0, 'Processing', 
          `Processing ${machine.MachineAlias}`, 
          `Processing log ${i + 1}/${totalLogsFound}`, totalLogsFound, i + 1, newLogs.length);
        
        try {
          console.log(` Processing log ${i + 1}/${totalLogsFound}: Badge=${log.badgeNumber || log.deviceUserId}, Time=${log.timestamp}`);
          console.log(` Available log fields:`, Object.keys(log));
          console.log(` Log data:`, log);
          
          // Get user info from badge number - try multiple possible fields
          const badgeNumber = log.badgeNumber || log.deviceUserId || log.employeeId || log.userSn;
          console.log(`🔍 Using badge number: ${badgeNumber}`);
          
          const userInfo = await getUserIdFromBadgeNumber(badgeNumber, pool);
          
          if (!userInfo) {
            console.log(`⚠️ Skipping log: Employee with badge ${badgeNumber} not found in USERINFO table`);
            unregisteredEmployees.push({
              badgeNumber: badgeNumber,
              timestamp: log.timestamp
            });
            skippedCount++;
            processedCount++;
            continue;
          }

          console.log(`✅ Found user: ${userInfo.name} (USERID: ${userInfo.userId}) for badge ${badgeNumber}`);

          // Check for duplicates
          const exists = await checkLogExists(log, pool);
          
          if (exists) {
            console.log(`⚠️ Duplicate log found: USERID=${userInfo.userId}, Time=${log.timestamp}`);
            duplicateCount++;
            processedCount++;
            continue;
          }

          // This is a new log - add to newLogs array
          newLogs.push({
            ...log,
            userId: userInfo.userId,
            userName: userInfo.name,
            badgeNumber: userInfo.badgeNumber
          });
          
          console.log(`✅ Added new log: ${userInfo.name} at ${log.timestamp}`);
          
          processedCount++;
          
          // Small delay for visual effect
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (logError) {
          console.error(`❌ Error processing individual log:`, logError);
          processedCount++;
        }
      }

      // Clear temporary array
      tempLogsArray.length = 0;
      console.log('Temporary logs array cleared');

      newLogsCount = newLogs.length;

      // Step 4: Complete
      progressTracker.setComplete(`Successfully previewed ${totalLogsFound} logs from ${machine.MachineAlias}`, totalLogsFound, processedCount, newLogsCount);

      // Send final result
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        message: `Successfully previewed ${totalLogsFound} logs from ${machine.MachineAlias}`,
        data: {
          logs: newLogs, // Only return new logs (not duplicates)
          totalLogs: totalLogsFound,
          newLogs: newLogsCount,
          duplicates: duplicateCount,
          skipped: skippedCount,
          unregisteredEmployees: unregisteredEmployees,
          machineAlias: machine.MachineAlias
        }
      })}\n\n`);

    } catch (previewError) {
      console.error('Error in preview process:', previewError);
      progressTracker.addError(`Preview failed: ${previewError.message}`);
      
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Failed to preview machine logs',
        error: previewError.message
      })}\n\n`);
    }

  } catch (error) {
    console.error('Error in manualFetchMachineLogs:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: `Error previewing machine logs: ${error.message}`
    })}\n\n`);
  } finally {
    res.end();
  }
};

// GET /api/machines/:id/sync-sse - Sync with Server-Sent Events for real-time progress
export const syncMachineLogsSSE = async (req, res) => {
  const progressTracker = new ProgressTracker();
  
  // Set up Server-Sent Events for progress updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to sync process"}\n\n');

  // Set up progress callback
  progressTracker.onProgress((progress) => {
    console.log('[SSE] Sending sync progress update:', progress);
    const progressData = { type: 'progress', ...progress };
    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
  });

  try {
    const { id } = req.params;
    const { startDate, endDate, saveToDatabase = true } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Start date and end date are required'
      })}\n\n`);
      res.end();
      return;
    }
    
    // Get machine details
    const machine = await getMachineByIdHelper(id);
    if (!machine) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Machine not found'
      })}\n\n`);
      res.end();
      return;
    }

    try {
      // Step 1: Connect to device
      progressTracker.updateProgress(0, 'Connecting', `Connecting to ${machine.MachineAlias}`, 'Establishing connection...', 0, 0, 0);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Count total logs on machine
      progressTracker.updateProgress(0, 'Counting Logs', 'Counting total logs on machine', 'Please wait...', 0, 0, 0);
      
      const { fetchTimeLogsFromMachine, getUserIdFromBadgeNumber, checkLogExists } = await import('../utils/zktecoSDK.js');
      const pool = await getDb();
      
      // Fetch all logs from machine and store in temporary array
      const tempLogsArray = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
      const totalLogsFound = tempLogsArray.length;
      
      if (totalLogsFound === 0) {
        progressTracker.setComplete('No logs found for the specified date range', 0, 0, 0);
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          success: true,
          message: 'No logs found for the specified date range',
          data: {
            logs: [],
            totalLogs: 0,
            saved: 0,
            duplicates: 0
          }
        })}\n\n`);
        res.end();
        return;
      }

      progressTracker.updateProgress(0, 'Processing', `Found ${totalLogsFound} logs`, 'Starting to process logs...', totalLogsFound, 0, 0);

      // Step 3: Process logs one by one
      let processedCount = 0;
      let savedCount = 0;
      let duplicateCount = 0;
      const savedLogs = [];

      for (let i = 0; i < tempLogsArray.length; i++) {
        const log = tempLogsArray[i];
        const progressPercent = Math.round(((i + 1) / totalLogsFound) * 100);
        
        progressTracker.updateProgress(0, 'Processing', 
          `Processing log ${i + 1} of ${totalLogsFound}`, 
          `Checking duplicates and saving...`, 
          totalLogsFound, i + 1, savedCount);

        try {
          // Get USERID from badge number
          const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
          if (!userInfo) {
            console.log(`Skipping log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
            processedCount++;
            continue;
          }

          // Check for duplicates
          const exists = await checkLogExists(log, pool);
          if (exists) {
            console.log(`Duplicate found: USERID ${userInfo.userId} at ${log.timestamp}`);
            duplicateCount++;
            processedCount++;
            continue;
          }

          // Save to database if no duplicate and saveToDatabase is true
          if (saveToDatabase === 'true') {
            // Prepare data for insertion
            const checkTime = log.timestamp;
            const sensorId = String(log.deviceId || log.deviceName || '');
            const deviceSn = String(log.deviceSerialNumber || log.userSn || '');
            const checkType = String(log.inOutMode || 'I');
            const verifyCode = parseInt(log.verifyMode) || 1;
            const memoInfo = null;
            const workCode = parseInt(log.workCode) || 0;
            const userExtFmt = String(log.reserved || '');

            // Insert to database
            const insertQuery = `
              INSERT INTO CHECKINOUT (
                USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, 
                MEMOINFO, WORKCODE, SN, USEREXTFMT
              ) VALUES (
                @USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID, 
                @MEMOINFO, @WORKCODE, @SN, @USEREXTFMT
              )
            `;

            await pool.request()
              .input('USERID', sql.Int, userInfo.userId)
              .input('CHECKTIME', sql.VarChar(50), checkTime)
              .input('CHECKTYPE', sql.VarChar(1), checkType)
              .input('VERIFYCODE', sql.Int, verifyCode)
              .input('SENSORID', sql.VarChar(20), sensorId)
              .input('MEMOINFO', sql.VarChar(100), memoInfo)
              .input('WORKCODE', sql.Int, workCode)
              .input('SN', sql.VarChar(50), deviceSn)
              .input('USEREXTFMT', sql.VarChar(100), userExtFmt)
              .query(insertQuery);

            savedCount++;
            savedLogs.push({
              ...log,
              userId: userInfo.userId,
              userName: userInfo.name,
              badgeNumber: userInfo.badgeNumber
            });

            console.log(`✅ Saved log: USERID ${userInfo.userId}, Name=${userInfo.name}, Time=${checkTime}`);
          }

          processedCount++;

        } catch (logError) {
          console.error(`Error processing log ${i + 1}:`, logError);
          processedCount++;
        }

        // Small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Step 4: Clear temporary array
      tempLogsArray.length = 0; // Empty the temporary array
      console.log('Temporary logs array cleared');

      // Step 5: Complete
      progressTracker.setComplete(`Successfully processed ${totalLogsFound} logs`, totalLogsFound, processedCount, savedCount);

      // Send final result
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        message: `Successfully processed ${totalLogsFound} logs from ${machine.MachineAlias}`,
        data: {
          logs: savedLogs, // Only return saved logs
          totalLogs: totalLogsFound,
          saved: savedCount,
          duplicates: duplicateCount,
          processed: processedCount,
          machineAlias: machine.MachineAlias
        }
      })}\n\n`);

    } catch (syncError) {
      console.error('Error in sync process:', syncError);
      progressTracker.addError(`Sync failed: ${syncError.message}`);
      
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Failed to sync machine logs',
        error: syncError.message
      })}\n\n`);
    }

  } catch (error) {
    console.error('Error in syncMachineLogsSSE:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: `Error syncing machine logs: ${error.message}`
    })}\n\n`);
  } finally {
    res.end();
  }
};

// GET /api/machines/sync-all-sse - Sync all machines with Server-Sent Events and ping checking
export const syncAllMachineLogsSSE = async (req, res) => {
  const progressTracker = new ProgressTracker();
  
  // Set up Server-Sent Events for progress updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to bulk sync process"}\n\n');

  // Set up progress callback
  progressTracker.onProgress((progress) => {
    console.log('[SSE] Sending bulk sync progress update:', progress);
    const progressData = { type: 'progress', ...progress };
    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
  });

  try {
    const { startDate, endDate, saveToDatabase = true } = req.query;
    
    // Validate date parameters
    if (!startDate || !endDate) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        success: false,
        message: 'Start date and end date are required'
      })}\n\n`);
      res.end();
      return;
    }
    
    const pool = await getDb();
    
    // Step 1: Get all enabled machines
    progressTracker.updateProgress(0, 'Initializing', 'Getting machine list', 'Querying enabled machines', 0, 0, 0);
    
    const machinesResult = await pool.request().query(`
      SELECT * FROM Machines 
      WHERE Enabled = 1 
      ORDER BY MachineAlias
    `);
    
    const machines = machinesResult.recordset;
    
    if (machines.length === 0) {
      progressTracker.setComplete('No enabled machines found', 0, 0, 0);
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        message: 'No enabled machines found',
        data: { results: [], totalMachines: 0, totalLogs: 0, totalSaved: 0 }
      })}\n\n`);
      res.end();
      return;
    }

    progressTracker.updateProgress(5, 'Checking Connectivity', `Found ${machines.length} machines`, 'Testing connectivity to all machines', 0, 0, 0);

    // Step 2: Check connectivity for all machines
    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    const onlineMachines = [];
    const offlineMachines = [];

    for (let i = 0; i < machines.length; i++) {
      const machine = machines[i];
      const connectivityProgress = 5 + Math.round((i / machines.length) * 15); // 5-20%
      
      progressTracker.updateProgress(connectivityProgress, 'Checking Connectivity', 
        `Testing ${machine.MachineAlias} (${i + 1}/${machines.length})`, 
        `IP: ${machine.IP}:${machine.Port}`, 0, 0, 0);
      
      const connection = new ZKTecoConnection(machine);
      
      try {
        const startTime = Date.now();
        const isReachable = await connection.testConnection();
        const pingTime = Date.now() - startTime;
        
        if (isReachable && pingTime <= 1000) {
          onlineMachines.push(machine);
          console.log(`✅ ${machine.MachineAlias} is online (${pingTime}ms)`);
        } else {
          offlineMachines.push({
            ...machine,
            reason: pingTime > 1000 ? `High latency: ${pingTime}ms` : 'Connection failed'
          });
          console.log(`❌ ${machine.MachineAlias} is offline: ${pingTime > 1000 ? `High latency (${pingTime}ms)` : 'Connection failed'}`);
        }
      } catch (error) {
        offlineMachines.push({
          ...machine,
          reason: error.message
        });
        console.log(`❌ ${machine.MachineAlias} is offline: ${error.message}`);
      }
    }

    progressTracker.updateProgress(20, 'Connectivity Check Complete', 
      `${onlineMachines.length} online, ${offlineMachines.length} offline`, 
      `Ready to fetch from ${onlineMachines.length} machines`, 0, 0, 0);

    if (onlineMachines.length === 0) {
      progressTracker.setComplete('No online machines found', 0, 0, 0);
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: true,
        message: 'No online machines found',
        data: { 
          results: [], 
          totalMachines: machines.length, 
          onlineMachines: 0,
          offlineMachines: offlineMachines.length,
          totalLogs: 0, 
          totalSaved: 0 
        }
      })}\n\n`);
      res.end();
      return;
    }

    // Step 3: Execute individual machine sync for each online machine
    progressTracker.updateProgress(20, 'Executing Individual Syncs', 
      `Processing ${onlineMachines.length} machines`, 
      'Executing individual fetch logs for each machine...', 0, 0, 0);
    
    const results = [];
    let totalLogsProcessed = 0;
    let totalSaved = 0;
    let totalDuplicates = 0;

    for (let i = 0; i < onlineMachines.length; i++) {
      const machine = onlineMachines[i];
      
      // Calculate base progress for this machine (20% + (i/total) * 75%)
      const baseProgress = 20 + Math.round((i / onlineMachines.length) * 75);
      
      progressTracker.updateProgress(baseProgress, 'Executing Individual Syncs', 
        `Processing ${machine.MachineAlias} (${i + 1}/${onlineMachines.length})`, 
        `Starting to read logs from ${machine.MachineAlias}...`, 0, 0, 0);
      
      try {
        console.log(`🔄 Starting individual sync for ${machine.MachineAlias}...`);
        
        // Create a new progress tracker for this individual machine
        const machineProgressTracker = new ProgressTracker();
        
        // Set up progress callback for this machine with enhanced details
        machineProgressTracker.onProgress((machineProgress) => {
          // Calculate overall progress: base progress + (machine progress / 100) * (75% / total machines)
          const machineProgressContribution = (machineProgress.percentage || 0) / 100 * (75 / onlineMachines.length);
          const overallProgress = Math.min(20 + Math.round((i / onlineMachines.length) * 75) + machineProgressContribution, 95);
          
          // Manually update the progress tracker with all the data we need
          progressTracker.progress.percentage = overallProgress;
          progressTracker.progress.currentStep = 'Executing Individual Syncs';
          progressTracker.progress.message = `Processing ${machine.MachineAlias} (${i + 1}/${onlineMachines.length})`;
          progressTracker.progress.details = machineProgress.message;
          progressTracker.progress.logsFound = machineProgress.logsFound || 0;
          progressTracker.progress.logsProcessed = machineProgress.logsProcessed || 0;
          progressTracker.progress.logsSaved = machineProgress.logsSaved || 0;
          progressTracker.progress.totalMachines = onlineMachines.length;
          progressTracker.progress.processedMachines = i;
          progressTracker.progress.currentMachine = machine.MachineAlias;
          progressTracker.progress.currentMachineProgress = machineProgress.percentage || 0;
          progressTracker.progress.currentMachineStep = machineProgress.currentStep || '';
          progressTracker.progress.currentMachineDetails = machineProgress.details || '';
          
          // Debug logging to see what's being sent
          console.log(`[DEBUG] Machine progress update for ${machine.MachineAlias}:`, {
            logsFound: machineProgress.logsFound,
            logsProcessed: machineProgress.logsProcessed,
            logsSaved: machineProgress.logsSaved,
            currentStep: machineProgress.currentStep,
            percentage: machineProgress.percentage
          });
          
          // Manually trigger the progress callbacks
          progressTracker.progressCallbacks.forEach(callback => {
            try {
              callback(progressTracker.getProgress());
            } catch (error) {
              console.error('Error in progress callback:', error);
            }
          });
        });

        // Call the individual machine sync function
        const machineResult = await syncMachineLogsSSEInternal(machine, startDate, endDate, saveToDatabase, machineProgressTracker);
        
        // Add machine result to overall results
        results.push({
          machineId: machine.ID,
          machineAlias: machine.MachineAlias,
          success: machineResult.success,
          logs: machineResult.logs || [],
          totalLogs: machineResult.totalLogs || 0,
          saved: machineResult.saved || 0,
          duplicates: machineResult.duplicates || 0,
          processed: machineResult.processed || 0,
          error: machineResult.error
        });

        // Update totals
        totalLogsProcessed += machineResult.totalLogs || 0;
        totalSaved += machineResult.saved || 0;
        totalDuplicates += machineResult.duplicates || 0;
        
        console.log(`✅ ${machine.MachineAlias}: ${machineResult.saved || 0} saved, ${machineResult.duplicates || 0} duplicates`);
        
        // Update progress after completing machine
        const completedProgress = 20 + Math.round(((i + 1) / onlineMachines.length) * 75);
        progressTracker.updateProgress(completedProgress, 'Executing Individual Syncs', 
          `Completed ${machine.MachineAlias}`, 
          `Processed ${i + 1}/${onlineMachines.length} machines`, 0, 0, 0, {
            totalMachines: onlineMachines.length,
            processedMachines: i + 1,
            machineResults: results
          });
        
      } catch (error) {
        console.error(`❌ Error processing ${machine.MachineAlias}:`, error);
        results.push({
          machineId: machine.ID,
          machineAlias: machine.MachineAlias,
          success: false,
          error: error.message,
          logs: [],
          totalLogs: 0,
          saved: 0,
          duplicates: 0,
          processed: 0
        });
      }
    }

    // Step 4: Complete
    progressTracker.setComplete(`Bulk sync completed for ${onlineMachines.length} machines`, 
      totalLogsProcessed, totalLogsProcessed, totalSaved);

    // Send final result
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      message: `Bulk sync completed for ${onlineMachines.length}/${machines.length} machines`,
      data: {
        results: results,
        totalMachines: machines.length,
        onlineMachines: onlineMachines.length,
        offlineMachines: offlineMachines.length,
        totalLogs: totalLogsProcessed,
        totalSaved: totalSaved,
        totalDuplicates: totalDuplicates,
        dateRange: { startDate, endDate }
      }
    })}\n\n`);
    
  } catch (error) {
    console.error('Error in syncAllMachineLogsSSE:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: `Error syncing all machine logs: ${error.message}`
    })}\n\n`);
  } finally {
    res.end();
  }
};

// Internal function to sync a single machine (extracted from syncMachineLogsSSE)
const syncMachineLogsSSEInternal = async (machine, startDate, endDate, saveToDatabase, progressTracker) => {
  try {
    // Import required functions
    const { 
      fetchTimeLogsFromMachine, 
      saveLogsToCHECKINOUT, // Individual fetch logs function
      saveLogsToCHECKINOUT_FetchAll, // Fetch all logs function
      getUserIdFromBadgeNumber, 
      checkLogExists 
    } = await import('../utils/zktecoSDK.js');
    
    // Step 1: Connect and fetch logs
    progressTracker.updateProgress(0, 'Connecting', `Connecting to ${machine.MachineAlias}`, 'Establishing connection...', 0, 0, 0);
    
    const logs = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
    const totalLogs = logs.length;
    
    if (totalLogs === 0) {
      progressTracker.setComplete(`No logs found for ${machine.MachineAlias}`, 0, 0, 0);
      return {
        success: true,
        logs: [],
        totalLogs: 0,
        saved: 0,
        duplicates: 0,
        processed: 0
      };
    }

    // Step 2: Filter existing logs and save new ones
    progressTracker.updateProgress(0, 'Processing', `Processing ${totalLogs} logs from ${machine.MachineAlias}`, 'Checking for duplicates and saving...', totalLogs, 0, 0);
    
    // Use the fetch all specific function
    const saveResult = await saveLogsToCHECKINOUT_FetchAll(logs, progressTracker);
    
    progressTracker.setComplete(`Completed ${machine.MachineAlias}`, totalLogs, saveResult.count || 0, saveResult.count || 0);
    
    return {
      success: saveResult.success,
      logs: saveResult.newLogs || [],
      totalLogs: totalLogs,
      saved: saveResult.count || 0,
      duplicates: saveResult.duplicates || 0,
      processed: totalLogs,
      skipped: saveResult.skipped || 0,
      unregisteredEmployees: saveResult.unregisteredEmployees || []
    };
    
  } catch (error) {
    console.error(`Error in syncMachineLogsSSEInternal for ${machine.MachineAlias}:`, error);
    return {
      success: false,
      error: error.message,
      logs: [],
      totalLogs: 0,
      saved: 0,
      duplicates: 0,
      processed: 0
    };
  }
};

// GET /api/machines/device-info - Get real-time device information for all machines
export const getMachinesDeviceInfo = async (req, res) => {
  try {
    console.log('Starting getMachinesDeviceInfo...');
    const pool = await getDb();
    
    // Get all enabled machines
    const machinesResult = await pool.request().query(`
      SELECT * FROM Machines 
      WHERE Enabled = 1 
      ORDER BY MachineAlias
    `);
    
    const machines = machinesResult.recordset;
    console.log(`Found ${machines.length} enabled machines`);
    
    if (machines.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No enabled machines found'
      });
    }

    // Get biometric counts from database for all machines
    const biometricCountsResult = await pool.request().query(`
      SELECT 
        m.ID as machineId,
        m.MachineAlias,
        m.IP,
        m.Port,
        -- Count fingerprint templates by matching USERID
        (SELECT COUNT(*) 
         FROM TEMPLATE t 
         INNER JOIN USERINFO u ON t.USERID = u.USERID
         WHERE u.privilege != -1) as databaseFingerprintCount,
        -- Count face templates by matching pin to BADGENUMBER
        (SELECT COUNT(*) 
         FROM FaceTemp f 
         INNER JOIN USERINFO u ON f.pin = u.BADGENUMBER
         WHERE u.privilege != -1) as databaseFaceCount,
        -- Count logs
        (SELECT COUNT(*) FROM LOCATOR2) as databaseLogCount
      FROM Machines m
      WHERE m.Enabled = 1
    `);

    const biometricCounts = {};
    biometricCountsResult.recordset.forEach(row => {
      biometricCounts[row.machineId] = {
        databaseFingerprintCount: row.databaseFingerprintCount,
        databaseFaceCount: row.databaseFaceCount,
        databaseLogCount: row.databaseLogCount
      };
    });

    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    const deviceInfoResults = [];

    // Process machines in parallel with a timeout for each
    const processMachine = async (machine) => {
      console.log(`Processing machine: ${machine.MachineAlias} (${machine.IP})`);
      const connection = new ZKTecoConnection(machine);
      
      try {
        // Set a timeout for each machine (30 seconds)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Machine timeout')), 30000);
        });
        
        const processPromise = (async () => {
          // Test connection first
          console.log(`Testing connection to ${machine.MachineAlias}...`);
          const isOnline = await connection.testConnection();
          console.log(`Connection test result for ${machine.MachineAlias}: ${isOnline}`);
          
          if (isOnline) {
            // Connect and get device info
            console.log(`Connecting to ${machine.MachineAlias}...`);
            await connection.connect();
            console.log(`Getting device info from ${machine.MachineAlias}...`);
            const deviceInfo = await connection.getDeviceInfo();
            console.log(`Device info from ${machine.MachineAlias}:`, deviceInfo);
            await connection.disconnect();
            
            return {
              machineId: machine.ID,
              machineAlias: machine.MachineAlias,
              ip: machine.IP,
              port: machine.Port,
              isOnline: true,
              userCount: deviceInfo.userCount,
              fingerprintCount: deviceInfo.fingerprintCount,
              faceCount: deviceInfo.faceCount,
              logCount: deviceInfo.logCount,
              // Add database counts
              databaseFingerprintCount: biometricCounts[machine.ID]?.databaseFingerprintCount || 0,
              databaseFaceCount: biometricCounts[machine.ID]?.databaseFaceCount || 0,
              databaseLogCount: biometricCounts[machine.ID]?.databaseLogCount || 0,
              serialNumber: deviceInfo.serialNumber,
              firmwareVersion: deviceInfo.firmwareVersion
            };
          } else {
            // Device is offline
            console.log(`${machine.MachineAlias} is offline`);
            return {
              machineId: machine.ID,
              machineAlias: machine.MachineAlias,
              ip: machine.IP,
              port: machine.Port,
              isOnline: false,
              userCount: 0,
              fingerprintCount: 0,
              faceCount: 0,
              logCount: 0,
              // Add database counts even when offline
              databaseFingerprintCount: biometricCounts[machine.ID]?.databaseFingerprintCount || 0,
              databaseFaceCount: biometricCounts[machine.ID]?.databaseFaceCount || 0,
              databaseLogCount: biometricCounts[machine.ID]?.databaseLogCount || 0,
              serialNumber: machine.sn || 'Unknown',
              firmwareVersion: machine.FirmwareVersion || 'Unknown'
            };
          }
        })();
        
        return await Promise.race([processPromise, timeoutPromise]);
        
      } catch (error) {
        console.error(`Error getting device info for ${machine.MachineAlias}:`, error);
        return {
          machineId: machine.ID,
          machineAlias: machine.MachineAlias,
          ip: machine.IP,
          port: machine.Port,
          isOnline: false,
          userCount: 0,
          fingerprintCount: 0,
          faceCount: 0,
          logCount: 0,
          // Add database counts even on error
          databaseFingerprintCount: biometricCounts[machine.ID]?.databaseFingerprintCount || 0,
          databaseFaceCount: biometricCounts[machine.ID]?.databaseFaceCount || 0,
          databaseLogCount: biometricCounts[machine.ID]?.databaseLogCount || 0,
          serialNumber: machine.sn || 'Unknown',
          firmwareVersion: machine.FirmwareVersion || 'Unknown'
        };
      }
    };

    // Process all machines in parallel
    const results = await Promise.allSettled(
      machines.map(machine => processMachine(machine))
    );

    // Process results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        deviceInfoResults.push(result.value);
      } else {
        console.error(`Failed to process machine ${machines[index].MachineAlias}:`, result.reason);
        deviceInfoResults.push({
          machineId: machines[index].ID,
          machineAlias: machines[index].MachineAlias,
          ip: machines[index].IP,
          port: machines[index].Port,
          isOnline: false,
          userCount: 0,
          fingerprintCount: 0,
          faceCount: 0,
          logCount: 0,
          databaseFingerprintCount: biometricCounts[machines[index].ID]?.databaseFingerprintCount || 0,
          databaseFaceCount: biometricCounts[machines[index].ID]?.databaseFaceCount || 0,
          databaseLogCount: biometricCounts[machines[index].ID]?.databaseLogCount || 0,
          serialNumber: machines[index].sn || 'Unknown',
          firmwareVersion: machines[index].FirmwareVersion || 'Unknown'
        });
      }
    });

    console.log('Device info results:', deviceInfoResults);

    res.json({
      success: true,
      data: deviceInfoResults,
      message: `Retrieved device information for ${deviceInfoResults.length} machines`
    });

  } catch (error) {
    console.error('Error in getMachinesDeviceInfo:', error);
    res.status(500).json({
      success: false,
      message: `Error getting device information: ${error.message}`
    });
  }
};

// Test machine connection
export const testMachineConnection = async (req, res) => {
  try {
    const { ipAddress, port, password } = req.body;

    if (!ipAddress || !port) {
      return res.status(400).json({
        success: false,
        message: 'IP address and port are required'
      });
    }

    // Import ZKTecoConnection dynamically to avoid issues
    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    
    const startTime = Date.now();
    
    try {
      // Create a temporary machine object for testing (same structure as in preview logs)
      const tempMachine = {
        IP: ipAddress,
        Port: port,
        Password: password || 0,
        MachineAlias: 'Test Connection'
      };
      
      const connection = new ZKTecoConnection(tempMachine);
      
      // Test connection first (same as preview logs)
      const isReachable = await connection.testConnection();
      if (!isReachable) {
        const pingTime = Date.now() - startTime;
        return res.json({
          success: false,
          message: `Device ${ipAddress} is not reachable`,
          pingTime: pingTime
        });
      }

      // Try to connect to machine (same as preview logs)
      await connection.connect();
      
      // Test getting device info (optional - to verify full connection)
      try {
        const deviceInfo = await connection.getDeviceInfo();
        console.log('Device info retrieved:', deviceInfo);
      } catch (infoError) {
        console.log('Could not retrieve device info, but connection successful:', infoError.message);
      }
      
      // Disconnect
      await connection.disconnect();
      
      const pingTime = Date.now() - startTime;
      
      res.json({
        success: true,
        message: 'Connection successful',
        pingTime: pingTime
      });
      
    } catch (connectionError) {
      const pingTime = Date.now() - startTime;
      
      // Try to disconnect even if there was an error (same as preview logs)
      try {
        if (connection) {
          await connection.disconnect();
        }
      } catch (disconnectError) {
        console.error('Error disconnecting:', disconnectError);
      }
      
      res.json({
        success: false,
        message: `Connection failed: ${connectionError.message}`,
        pingTime: pingTime
      });
    }
  } catch (error) {
    console.error('Error testing machine connection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Sync time to machine
export const syncMachineTime = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get machine details
    const machine = await getMachineByIdHelper(id);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    // Import ZKTecoConnection dynamically
    const { ZKTecoConnection } = await import('../utils/zktecoSDK.js');
    
    try {
      const connection = new ZKTecoConnection(machine);
      
      // Test connection first
      const isReachable = await connection.testConnection();
      if (!isReachable) {
        return res.json({
          success: false,
          message: `Device ${machine.MachineAlias} (${machine.IP}) is not reachable`
        });
      }

      // Connect to machine
      await connection.connect();
      
      // Sync time (set current PC time to machine)
      const currentTime = new Date();
      await connection.setTime(currentTime);
      
      // Disconnect
      await connection.disconnect();
      
      res.json({
        success: true,
        message: `Time synchronized successfully. Machine time set to: ${currentTime.toLocaleString()}`,
        machineName: machine.MachineAlias,
        syncedTime: currentTime.toISOString()
      });
      
    } catch (connectionError) {
      // Try to disconnect even if there was an error
      try {
        if (connection) {
          await connection.disconnect();
        }
      } catch (disconnectError) {
        console.error('Error disconnecting:', disconnectError);
      }
      
      res.json({
        success: false,
        message: `Time sync failed: ${connectionError.message}`
      });
    }
  } catch (error) {
    console.error('Error syncing machine time:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Upload employees to biometric machine using native SDK
export const uploadEmployeesToMachine = async (req, res) => {
  try {
    const { id: machineId } = req.params;

    const employeeIdsQS = req.query.employeeIds;
    const employeeIdsBody = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : null;

    let employeeIdArray = [];
    if (employeeIdsQS && typeof employeeIdsQS === 'string') {
      employeeIdArray = employeeIdsQS
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !Number.isNaN(n));
    } else if (employeeIdsBody) {
      employeeIdArray = employeeIdsBody
        .map(n => parseInt(n, 10))
        .filter(n => !Number.isNaN(n));
    }

    if (!employeeIdArray.length) {
      return res.status(400).json({ success: false, message: 'Employee IDs are required' });
    }

    // Get machine details
    const machine = await getMachineByIdHelper(machineId);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    // Get employee details from database
    const pool = await getDb();
    
    const request = pool.request();
    employeeIdArray.forEach((id, index) => {
      request.input(`employeeId${index}`, sql.Int, id);
    });
    
    const query = `
      SELECT 
        u.USERID, 
        u.NAME, 
        u.BADGENUMBER, 
        u.privilege
      FROM USERINFO u
      WHERE u.USERID IN (${employeeIdArray.map((_, index) => `@employeeId${index}`).join(',')})
      AND u.privilege != -1
      ORDER BY u.NAME
    `;
    
    const employeeResult = await request.query(query);
    const employees = employeeResult.recordset;

    console.log(`Found ${employees.length} employees to upload to machine ${machineId}`);

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid employees found for the provided IDs'
      });
    }

    // Use native SDK to upload employees - with graceful fallback
    let sdk;
    try {
      const { ZKTecoNativeSDK } = await import('../utils/zktecoSDK_Native.js');
      sdk = new ZKTecoNativeSDK(machine.IP, machine.Port || 4370);
    } catch (sdkError) {
      console.warn('⚠️ ZKTeco Native SDK not available:', sdkError.message);
      return res.status(503).json({
        success: false,
        message: 'ZKTeco Native SDK is not available (Windows/COM required). This feature requires Windows and the ZKTeco SDK to be installed.',
        error: sdkError.message
      });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const uploaded = [];
    
    for (const employee of employees) {
      try {
        // Upload employee using SSR_SetUserInfo via native SDK
        await sdk.setUserInfo(
          employee.BADGENUMBER,        // Enroll Number (PIN on device)
          employee.NAME,                // Name
          employee.BADGENUMBER,         // Password (use BADGENUMBER as PIN)
          employee.privilege || 0,      // Privilege (0=user, 2=admin)
          true,                         // Enabled
          1                             // Machine Number
        );
        successCount++;
        uploaded.push({
          badgenumber: employee.BADGENUMBER,
          name: employee.NAME
        });
        console.log(`✅ Successfully uploaded: ${employee.BADGENUMBER} - ${employee.NAME}`);
      } catch (error) {
        errorCount++;
        errors.push({
          badgenumber: employee.BADGENUMBER,
          name: employee.NAME,
          error: error.message
        });
        console.error(`❌ Failed to upload ${employee.NAME}:`, error.message);
      }
    }
    
    res.json({
      success: successCount > 0,
      message: `Upload completed. Success: ${successCount}, Errors: ${errorCount}`,
      details: {
        machineAlias: machine.MachineAlias,
        machineIP: machine.IP,
        machinePort: machine.Port,
        totalEmployees: employees.length,
        successCount,
        errorCount,
        uploaded: uploaded,
        errors: errors.length > 0 ? errors : undefined
      }
    });
    
  } catch (error) {
    console.error('Error in uploadEmployeesToMachine:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading employees to machine',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Export employee data for manual upload to ZKTeco device
export const exportEmployeesForManualUpload = async (req, res) => {
  try {
    const { id: machineId } = req.params;

    const employeeIdsQS = req.query.employeeIds;
    const employeeIdsBody = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : null;

    let employeeIdArray = [];
    if (employeeIdsQS && typeof employeeIdsQS === 'string') {
      employeeIdArray = employeeIdsQS
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !Number.isNaN(n));
    } else if (employeeIdsBody) {
      employeeIdArray = employeeIdsBody
        .map(n => parseInt(n, 10))
        .filter(n => !Number.isNaN(n));
    }

    if (!employeeIdArray.length) {
      return res.status(400).json({ success: false, message: 'Employee IDs are required' });
    }

    // Get machine details
    const machine = await getMachineByIdHelper(machineId);
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    // Get employee details from database
    const pool = await getDb();
    
    // Create the request and add parameters
    const request = pool.request();
    employeeIdArray.forEach((id, index) => {
      request.input(`employeeId${index}`, sql.Int, id);
    });
    
    // Build the query
    const query = `
      SELECT 
        u.USERID, 
        u.NAME, 
        u.BADGENUMBER, 
        u.DEFAULTDEPTID,
        u.privilege,
        d.DEPTNAME
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      WHERE u.USERID IN (${employeeIdArray.map((_, index) => `@employeeId${index}`).join(',')})
      ORDER BY u.BADGENUMBER
    `;
    
    const employeeResult = await request.query(query);
    const employees = employeeResult.recordset;

    console.log(`Exporting ${employees.length} employees for manual upload to machine ${machineId}`);

    // Format employee data for manual entry
    const employeeData = employees.map(emp => ({
      enrollNumber: emp.BADGENUMBER, // PIN/Enroll Number for the device
      userid: emp.USERID,            // Internal database ID
      name: emp.NAME,
      password: emp.BADGENUMBER,     // Use BADGENUMBER as password/PIN
      privilege: emp.privilege || 0, // 0=user, 1=enroller, 2=admin, 3=super admin
      enabled: 1,                    // 1=enabled, 0=disabled
      department: emp.DEPTNAME || 'N/A'
    }));

    res.json({
      success: true,
      message: `Employee data prepared for manual upload to ${machine.MachineAlias}`,
      machineInfo: {
        name: machine.MachineAlias,
        ip: machine.IP,
        port: machine.Port,
        webInterface: `http://${machine.IP}`
      },
      employeeCount: employees.length,
      employees: employeeData,
      instructions: {
        step1: `Access device web interface at http://${machine.IP}`,
        step2: 'Login with admin credentials (default: admin/admin or admin/12345)',
        step3: 'Navigate to User Management or Personnel Management',
        step4: 'For each employee below, add user with:',
        fields: {
          enrollNumber: 'User ID / Enroll Number (use this as the employee ID on device)',
          name: 'Employee Name',
          password: 'Password/PIN (same as Enroll Number for consistency)',
          privilege: '0 = Normal User, 1 = Enroller, 2 = Administrator, 3 = Super Administrator',
          enabled: '1 = Enabled, 0 = Disabled'
        }
      }
    });

  } catch (error) {
    console.error('Error in exportEmployeesForManualUpload:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting employee data',
      error: error.message
    });
  }
};

// Get employees not uploaded to a specific machine
export const getNotUploadedEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Getting employees not uploaded to machine ID: ${id}`);
    
    // Get machine details
    const pool = getDb();
    const machineResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM MACHINES WHERE ID = @id');
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    const machine = machineResult.recordset[0];
    console.log(`Machine: ${machine.MachineAlias} (${machine.IP}:${machine.Port})`);
    
    // Get all employees from database
    const allEmployeesResult = await pool.request().query(`
      SELECT USERID, NAME, BADGENUMBER, DEFAULTDEPTID, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege
      FROM USERINFO 
      WHERE privilege != -1
      ORDER BY NAME
    `);
    
    const allEmployees = allEmployeesResult.recordset;
    console.log(`Total employees in database: ${allEmployees.length}`);
    
    // Get users from machine
    let machineUsers = [];
    let connectionError = null;
    
    try {
      machineUsers = await getUsersFromMachine(machine.IP, machine.Port);
      console.log(`Found ${machineUsers.length} users on machine ${machine.MachineAlias}`);
    } catch (error) {
      console.error('Error fetching users from machine:', error);
      connectionError = error.message;
      // Continue with empty machine users list
    }
    
    // Ensure machineUsers is an array
    if (!Array.isArray(machineUsers)) {
      machineUsers = [];
    }
    
    // Compare machine users with database employees
    console.log('\n=== COMPARISON DEBUG ===');
    console.log('Machine user IDs (first 10):', machineUsers.slice(0, 10).map(u => u.PIN || u.userId || u.id));
    console.log('Sample database employees (first 5):', allEmployees.slice(0, 5).map(emp => ({
      USERID: emp.USERID,
      BADGENUMBER: emp.BADGENUMBER,
      NAME: emp.NAME,
      privilege: emp.privilege
    })));
    
    // Extract PIN values from machine users (machine PIN maps to database BADGENUMBER)
    const machinePINs = new Set(
      machineUsers.map(user => String(user.PIN || '').trim())
      .filter(pin => pin !== '')
    );
    
    console.log(`Machine has ${machinePINs.size} unique PIN values`);
    console.log('Sample machine PINs (first 10):', Array.from(machinePINs).slice(0, 10));
    
    // Test a few specific PIN comparisons
    console.log('\n=== SPECIFIC COMPARISON TESTS ===');
    const testEmployees = allEmployees.slice(0, 5);
    testEmployees.forEach(emp => {
      const dbBadgeNumber = String(emp.BADGENUMBER || '').trim();
      const isOnMachine = machinePINs.has(dbBadgeNumber);
      console.log(`Employee: "${emp.NAME}", BADGENUMBER: "${emp.BADGENUMBER}" -> On machine: ${isOnMachine ? '✅' : '❌'}`);
    });
    
    // Filter employees not on machine
    const notUploadedEmployees = allEmployees.filter(employee => {
      const dbBadgeNumber = String(employee.BADGENUMBER || '').trim();
      const isOnMachine = machinePINs.has(dbBadgeNumber);
      return !isOnMachine;
    });
    
    console.log(`\n=== FILTERING RESULTS ===`);
    console.log(`Total employees in database (excluding privilege = -1): ${allEmployees.length}`);
    console.log(`Employees on machine: ${machinePINs.size}`);
    console.log(`Employees NOT on machine: ${notUploadedEmployees.length}`);
    
    res.json({
      success: true,
      data: notUploadedEmployees,
      totalEmployees: allEmployees.length,
      employeesOnMachine: machinePINs.size,
      notUploadedCount: notUploadedEmployees.length,
      uploadedCount: allEmployees.length - notUploadedEmployees.length,
      connectionError: connectionError || null
    });
    
  } catch (error) {
    console.error('Error in getNotUploadedEmployees:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching not uploaded employees',
      error: error.message
    });
  }
};

// Get users from a specific machine that are NOT in the database
export const getMachineUsers = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Getting users from machine ID: ${id} that are NOT in database`);
    
    // Get machine details
    const pool = await getDb();
    const machineResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM MACHINES WHERE ID = @id');
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    const machine = machineResult.recordset[0];
    console.log(`Machine: ${machine.MachineAlias} (${machine.IP}:${machine.Port})`);
    
    // Get users from the machine using ZKTeco SDK
    const { getUsersFromMachine } = await import('../utils/zktecoSDK.js');
    const machineUsers = await getUsersFromMachine(machine.IP, machine.Port);
    
    if (!Array.isArray(machineUsers)) {
      console.log('No users found on machine or connection failed');
      return res.json({
        success: true,
        data: [],
        message: 'No users found on machine or connection failed'
      });
    }
    
    console.log(`Found ${machineUsers.length} users on machine ${machine.MachineAlias}`);
    
    // Filter out machine users with privilege = -1
    const validMachineUsers = machineUsers.filter(user => {
      const privilege = user.Privilege || user.privilege || user.role;
      return privilege !== -1;
    });
    
    console.log(`Valid machine users (excluding privilege = -1): ${validMachineUsers.length}`);
    
    // Get ALL employees from database (including privilege = -1)
    const allEmployeesResult = await pool.request().query(`
      SELECT USERID, NAME, BADGENUMBER, DEFAULTDEPTID, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege
      FROM USERINFO 
      ORDER BY NAME
    `);
    
    const allEmployees = allEmployeesResult.recordset;
    console.log(`Total employees in database (including privilege = -1): ${allEmployees.length}`);
    
    // Enhanced debugging: Show sample database values
    console.log(`\n=== SAMPLE DATABASE VALUES ===`);
    const sampleDbUsers = allEmployees.slice(0, 10);
    sampleDbUsers.forEach((emp, index) => {
      console.log(`DB User ${index + 1}: "${emp.NAME}" - BADGENUMBER: "${emp.BADGENUMBER}" (privilege: ${emp.privilege})`);
    });
    
    // Enhanced debugging: Show sample machine values
    console.log(`\n=== SAMPLE MACHINE VALUES ===`);
    const sampleMachineUsers = validMachineUsers.slice(0, 10);
    sampleMachineUsers.forEach((user, index) => {
      console.log(`Machine User ${index + 1}: "${user.Name || user.name}" - PIN: "${user.PIN || user.userId}" (privilege: ${user.Privilege || user.privilege || user.role})`);
    });
    
    // Create a Set of database BADGENUMBERs for efficient lookup
    const databaseBadgeNumbers = new Set();
    allEmployees.forEach(emp => {
      const badgeNumber = String(emp.BADGENUMBER || '').trim();
      if (badgeNumber) {
        databaseBadgeNumbers.add(badgeNumber);
      }
    });
    
    console.log(`Database badge numbers: ${databaseBadgeNumbers.size}`);
    
    // Enhanced debugging: Check specific comparisons with exact values
    console.log(`\n=== DETAILED COMPARISON DEBUG ===`);
    let foundInDatabase = 0;
    let notFoundInDatabase = 0;
    
    // Check first 10 machine users with exact value comparison
    const testMachineUsers = validMachineUsers.slice(0, 10);
    testMachineUsers.forEach((user, index) => {
      const machinePIN = String(user.PIN || user.userId || '').trim();
      const isInDatabase = databaseBadgeNumbers.has(machinePIN);
      
      // Additional check: try to find the exact database record
      const dbUser = allEmployees.find(emp => String(emp.BADGENUMBER || '').trim() === machinePIN);
      
      if (isInDatabase) {
        foundInDatabase++;
        console.log(`✅ Machine user ${index + 1}: "${user.Name || user.name}" (PIN: "${machinePIN}") -> FOUND in database as "${dbUser?.NAME}" (privilege: ${dbUser?.privilege})`);
      } else {
        notFoundInDatabase++;
        console.log(`❌ Machine user ${index + 1}: "${user.Name || user.name}" (PIN: "${machinePIN}") -> NOT in database`);
        
        // Try to find similar names in database
        const similarDbUser = allEmployees.find(emp => 
          (emp.NAME || '').toLowerCase().includes((user.Name || user.name || '').toLowerCase()) ||
          (user.Name || user.name || '').toLowerCase().includes((emp.NAME || '').toLowerCase())
        );
        
        if (similarDbUser) {
          console.log(`   🔍 Similar name found in DB: "${similarDbUser.NAME}" (BADGE: "${similarDbUser.BADGENUMBER}", privilege: ${similarDbUser.privilege})`);
        }
      }
    });
    
    console.log(`\nSample results: ${foundInDatabase} found, ${notFoundInDatabase} not found`);
    
    // Filter valid machine users that are NOT in the database
    const usersNotInDatabase = validMachineUsers.filter(machineUser => {
      const machinePIN = String(machineUser.PIN || machineUser.userId || '').trim();
      const isInDatabase = databaseBadgeNumbers.has(machinePIN);
      return !isInDatabase;
    });
    
    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Total machine users: ${machineUsers.length}`);
    console.log(`Valid machine users (privilege != -1): ${validMachineUsers.length}`);
    console.log(`Database users (including privilege = -1): ${allEmployees.length}`);
    console.log(`Machine users NOT in database: ${usersNotInDatabase.length}`);
    
    res.json({
      success: true,
      data: usersNotInDatabase,
      message: `Found ${usersNotInDatabase.length} valid users on machine ${machine.MachineAlias} that are not in database`,
      totalMachineUsers: machineUsers.length,
      validMachineUsers: validMachineUsers.length,
      totalDatabaseUsers: allEmployees.length,
      notInDatabaseCount: usersNotInDatabase.length,
      debug: {
        foundInDatabase,
        notFoundInDatabase
      }
    });
    
  } catch (error) {
    console.error('Error in getMachineUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users from machine',
      error: error.message
    });
  }
};

// Download employee data from machine to database
export const downloadEmployeeFromMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, employeeData } = req.body;
    
    if (!userId || !employeeData) {
      return res.status(400).json({
        success: false,
        message: 'User ID and employee data are required'
      });
    }
    
    // Get machine details
    const pool = await getDb();
    const machineResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM MACHINES WHERE ID = @id');
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Download employee data from machine
    const { downloadEmployeeData } = await import('../utils/zktecoSDK.js');
    const result = await downloadEmployeeData(userId, employeeData, machine.IP, machine.Port);
    
    res.json({
      success: true,
      data: result,
      message: `Employee ${employeeData.name} downloaded successfully`
    });
    
  } catch (error) {
    console.error('Error in downloadEmployeeFromMachine:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading employee from machine',
      error: error.message
    });
  }
};
// Test ZKTeco Native SDK
export const testNativeSDK = async (req, res) => {
  try {
    const { ZKTecoNativeSDK } = await import('../utils/zktecoSDK_Native.js');
    
    // Just test if edge-js works at all
    let edgeTest;
    try {
      const edge = await import('edge-js');
      const testFunc = edge.default.func({
        source: `
          using System;
          using System.Threading.Tasks;
          
          public class Startup
          {
              public async Task<object> Invoke(dynamic input)
              {
                  return new { success = true, message = "Edge-js is working!" };
              }
          }
        `
      });
      
      edgeTest = await testFunc({});
      console.log('Edge-js test result:', edgeTest);
    } catch (edgeError) {
      console.error('Edge-js test error:', edgeError);
      return res.json({
        success: false,
        error: 'Edge-js is not working',
        details: edgeError.message
      });
    }
    
    // Test COM object availability
    let comTest;
    try {
      const edge = await import('edge-js');
      const comTestFunc = edge.default.func({
        source: `
          using System;
          using System.Threading.Tasks;
          
          public class Startup
          {
              public async Task<object> Invoke(dynamic input)
              {
                  try
                  {
                      Type type = Type.GetTypeFromProgID("zkemkeeper.ZKEM");
                      if (type == null)
                      {
                          return new { success = false, error = "zkemkeeper.ZKEM not registered" };
                      }
                      
                      dynamic sdk = Activator.CreateInstance(type);
                      return new { success = true, message = "zkemkeeper.ZKEM is registered and accessible" };
                  }
                  catch (Exception ex)
                  {
                      return new { success = false, error = ex.Message, type = ex.GetType().Name };
                  }
              }
          }
        `
      });
      
      comTest = await comTestFunc({});
      console.log('COM test result:', comTest);
    } catch (comError) {
      console.error('COM test error:', comError);
      return res.json({
        success: false,
        error: 'COM test failed',
        details: comError.message,
        edgeTest
      });
    }
    
    res.json({
      success: true,
      edgeTest,
      comTest,
      recommendation: comTest.success 
        ? 'SDK is ready to use!'
        : 'Please register the DLL: Run "Register_SDK x64.bat" as Administrator from backend/ZKSDK/SDK/x64/'
    });
    
  } catch (error) {
    console.error('Test native SDK error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

// Add this function to the machineController.js file

// GET /api/machines/simple - Get machines for device selection (simplified response)
export const getMachinesSimple = async (req, res) => {
  try {
    const pool = await getDb();
    const result = await pool.request().query(`
      SELECT 
        ID,
        MachineAlias,
        IP,
        Port,
        Enabled,
        ConnectType
      FROM Machines
      WHERE Enabled = 1
      ORDER BY MachineAlias
    `);
    
    console.log('🔍 Machines found in database:', result.recordset.length);
    result.recordset.forEach(machine => {
      console.log(`   - ${machine.MachineAlias} (ID: ${machine.ID}, IP: ${machine.IP})`);
    });
    
    res.json({
      success: true,
      machines: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    console.error('❌ Error fetching machines (simple):', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching machines',
      error: error.message
    });
  }
};

// ZKTeco PIN Authentication
export const authenticateWithPin = async (req, res) => {
  try {
    const { machineId, pin } = req.body;
    
    if (!machineId || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Machine ID and PIN are required'
      });
    }
    
    const pool = getDb();
    
    // Get machine details
    const machineResult = await pool.request()
      .input('machineId', sql.Int, machineId)
      .query(`
        SELECT * FROM Machines 
        WHERE ID = @machineId AND Enabled = 1
      `);
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found or disabled'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Get user by BADGENUMBER (PIN)
    const userResult = await pool.request()
      .input('badgeNumber', sql.VarChar(50), pin)
      .query(`
        SELECT USERID, NAME, BADGENUMBER, DEPARTMENT, STATUS
        FROM USERINFO 
        WHERE BADGENUMBER = @badgeNumber AND STATUS = 1
      `);
    
    if (userResult.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid PIN or user not found'
      });
    }
    
    const user = userResult.recordset[0];
    
    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        USERID: user.USERID, 
        role: 'employee',
        machineId: machineId
      },
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '8h' }
    );
    
    console.log(`✅ PIN authentication successful for user: ${user.NAME} (${user.BADGENUMBER})`);
    
    res.json({
      success: true,
      message: `Welcome, ${user.NAME}!`,
      user: {
        USERID: user.USERID,
        NAME: user.NAME,
        BADGENUMBER: user.BADGENUMBER,
        DEPARTMENT: user.DEPARTMENT
      },
      machine: {
        ID: machine.ID,
        MachineAlias: machine.MachineAlias,
        IP: machine.IP,
        Port: machine.Port
      },
      token: token
    });
    
  } catch (error) {
    console.error('❌ PIN authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// ZKTeco Real-time listening storage
const zktecoRealtimeListeners = new Map();
const zktecoLoginCallbacks = new Map();
const zktecoPollingIntervals = new Map();
const zktecoLastCheckTimes = new Map();
const zktecoLastProcessedTimes = new Map(); // last processed attendance time per machine
const zktecoAuthResults = new Map(); // last successful auth result per machine

// Replace the polling approach with real-time event listening
export const startZKTecoRealtimeListening = async (req, res) => {
  try {
    const { machineId } = req.body;
    
    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: 'Machine ID is required'
      });
    }
    
    const pool = getDb();
    
    // First, get the machine details without ConnectType filtering
    const machineResult = await pool.request()
      .input('machineId', sql.Int, machineId)
      .query(`
        SELECT * FROM Machines 
        WHERE ID = @machineId AND Enabled = 1
      `);
    
    if (machineResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found or disabled'
      });
    }
    
    const machine = machineResult.recordset[0];
    
    // Check if already listening
    if (zktecoRealtimeListeners.has(machineId)) {
      return res.json({
        success: true,
        message: `Real-time listening already active for ${machine.MachineAlias}`,
        machineId: machineId
      });
    }
    
    // Store callback for this machine
    zktecoLoginCallbacks.set(machineId, (loginEvent) => {
      console.log('🔔 Real-time ZKTeco login detected:', loginEvent);
    });
    
    // Add to active listeners
    zktecoRealtimeListeners.set(machineId, {
      machineId: machineId,
      machineName: machine.MachineAlias,
      startTime: new Date(),
      status: 'active'
    });
    
    // Start polling for new attendance logs
    startZKTecoPolling(machine);
    
    console.log(`✅ Started real-time listening for ZKTeco machine: ${machine.MachineAlias} (${machine.ConnectType})`);
    
    res.json({
      success: true,
      message: `Real-time listening started for ${machine.MachineAlias}`,
      machineId: machineId,
      machineType: machine.ConnectType
    });
    
  } catch (error) {
    console.error('❌ Error starting ZKTeco real-time listening:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start real-time listening',
      error: error.message
    });
  }
};

// Start ZKTeco polling
const startZKTecoPolling = (machine) => {
  const machineId = machine.ID;
  const pollInterval = 3000; // Poll every 3 seconds
  
  // Clear existing interval if any
  if (zktecoPollingIntervals.has(machineId)) {
    clearInterval(zktecoPollingIntervals.get(machineId));
  }
  
  // Set initial last check time
  zktecoLastCheckTimes.set(machineId, new Date());
  
  // Start polling with health check
  const intervalId = setInterval(async () => {
    try {
      await checkZKTecoForNewLogins(machine);
    } catch (error) {
      console.error(`❌ ZKTeco polling error for machine ${machineId}:`, error);
      // Don't stop polling on individual errors, just log them
      console.log(`🔄 Continuing polling despite error for machine ${machineId}`);
    }
  }, pollInterval);
  
  // Add health check to ensure polling continues
  const healthCheckInterval = setInterval(() => {
    if (!zktecoPollingIntervals.has(machineId)) {
      console.log(`⚠️ Polling interval missing for machine ${machineId}, restarting...`);
      startZKTecoPolling(machine);
      clearInterval(healthCheckInterval);
    }
  }, 10000); // Check every 10 seconds
  
  zktecoPollingIntervals.set(machineId, intervalId);
  console.log(`🔄 Started ZKTeco polling for machine ${machineId} every ${pollInterval}ms`);
};

// Check for new ZKTeco login events
const checkZKTecoForNewLogins = async (machine) => {
  let zk = null;
  try {
    const machineId = machine.ID;
    const lastCheckTime = zktecoLastCheckTimes.get(machineId);
    const lastProcessedTime = zktecoLastProcessedTimes.get(machineId);
    const currentTime = new Date();

    // Connect to ZKTeco device with timeout
    zk = new ZKLib(machine.IP, machine.Port || 4370, 10000, 10000);
    
    // Add connection timeout
    const connectPromise = zk.createSocket();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);

    const attendanceResult = await zk.getAttendances();

    const attendanceLogs = attendanceResult && attendanceResult.data ? attendanceResult.data : [];

    // Debug: Show total logs and recent ones
    console.log(`📊 Found ${attendanceLogs.length} total attendance logs on machine ${machine.ID}`);
    
    // Show the 5 most recent logs for debugging
    const recentLogs = attendanceLogs
      .map((log) => {
        const ts = log.recordTime || log.timestamp || log.time || log.date;
        const t = ts ? new Date(ts) : null;
        return { log, t };
      })
      .filter(({ t }) => t)
      .sort((a, b) => b.t.getTime() - a.t.getTime())
      .slice(0, 5);
    
    console.log('🔍 Recent logs:', recentLogs.map(({ log, t }) => ({
      userId: log.deviceUserId || log.uid,
      time: t.toISOString(),
      recordTime: log.recordTime,
      timestamp: log.timestamp,
      time: log.time,
      date: log.date
    })));

    // Select only ONE: the most recent with time within 5 seconds before now
    const nowMs = currentTime.getTime();
    const fiveSecMs = 5000;
    
    console.log(`🕐 Current time: ${new Date(nowMs).toISOString()}`);
    console.log(`🕐 Looking for logs within last 5 seconds (after ${new Date(nowMs - fiveSecMs).toISOString()})`);

    // Map logs to {log, time} and filter valid timestamp
    const candidate = attendanceLogs
      .map((log) => {
        const ts =
          log.recordTime ||
          log.timestamp ||
          log.time ||
          log.date;
        const t = ts ? new Date(ts) : null;
        return { log, t };
      })
      .filter(({ t }) => t && t.getTime() <= nowMs && (nowMs - t.getTime()) <= fiveSecMs) // within last 5s, not future
      .sort((a, b) => b.t.getTime() - a.t.getTime()) // newest first
      .shift(); // pick only one

    console.log(`🎯 Found ${candidate ? 1 : 0} candidate logs within 5-second window`);

    if (candidate) {
      const candTime = candidate.t;
      console.log(`🆕 Candidate: User ${candidate.log.deviceUserId || candidate.log.uid} at ${candTime.toISOString()}`);
      
      // Avoid duplicate processing (if equal or older than last processed)
      if (!lastProcessedTime || candTime.getTime() > new Date(lastProcessedTime).getTime()) {
        console.log(`🆕 Latest login detected: User ${candidate.log.deviceUserId || candidate.log.uid} at ${candTime.toISOString()}`);
        await processZKTecoLoginEvent(machine, candidate.log);
        zktecoLastProcessedTimes.set(machineId, candTime.toISOString());
      } else {
        console.log(`⏭️ Skipping duplicate processing for ${candTime.toISOString()}`);
      }
    } else {
      console.log(`❌ No new logs found within 5-second window`);
    }

    // Update last check time
    zktecoLastCheckTimes.set(machineId, currentTime);

  } catch (error) {
    console.error(`❌ Error checking ZKTeco for new logins on machine ${machine.ID}:`, error);
    // Don't rethrow - let polling continue
  } finally {
    // Always try to disconnect safely
    if (zk) {
      try {
        await zk.disconnect();
      } catch (disconnectError) {
        console.log(`⚠️ Error disconnecting from machine ${machine.ID}:`, disconnectError.message);
      }
    }
  }
};

// Process ZKTeco login event
const processZKTecoLoginEvent = async (machine, attendanceLog) => {
  try {
    const machineId = machine.ID;
    
    // Get PIN from attendance log
    const pin = attendanceLog.deviceUserId || attendanceLog.uid;
    
    // Get user information by PIN (BADGENUMBER)
    const userInfo = await getUserByZKTecoPin(pin);
    
    if (userInfo) {
      // Handle different timestamp formats
      const loginTime = attendanceLog.recordTime || attendanceLog.timestamp || attendanceLog.time || attendanceLog.date;
      
      const loginEvent = {
        machineId: machineId,
        machineName: machine.MachineAlias,
        userId: pin,
        userName: userInfo.NAME,
        userBadge: userInfo.BADGENUMBER,
        loginTime: loginTime,
        verifyMode: attendanceLog.verifyMode,
        inOutMode: attendanceLog.inOutMode,
        workCode: attendanceLog.workCode
      };
      
      console.log(`🔔 Real-time ZKTeco login detected: ${userInfo.NAME} (${userInfo.BADGENUMBER}) at ${machine.MachineAlias}`);
      
      // Authenticate immediately (server-side)
      const token = jwt.sign(
        {
          USERID: userInfo.USERID,
          role: 'employee',
          machineId: machineId
        },
        process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
        { expiresIn: '8h' }
      );
      
      // Store last auth result for frontend polling
      zktecoAuthResults.set(machineId, {
        success: true,
        user: {
          USERID: userInfo.USERID,
          NAME: userInfo.NAME,
          BADGENUMBER: userInfo.BADGENUMBER,
          DEPARTMENT: userInfo.DEPARTMENT
        },
        token,
        loginTime
      });
      
      // Trigger callback if registered (optional)
      const callback = zktecoLoginCallbacks.get(machineId);
      if (callback) {
        callback(loginEvent);
      }
      
    } else {
      console.log(`⚠️ User not found for PIN: ${pin}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ZKTeco login event:`, error);
  }
};

// Get user by ZKTeco PIN (BADGENUMBER)
const getUserByZKTecoPin = async (pin) => {
  try {
    const pool = getDb();
    const result = await pool.request()
      .input('pin', sql.VarChar(50), pin.toString())
      .query(`
        SELECT USERID, NAME, BADGENUMBER, DEPARTMENT, STATUS
        FROM USERINFO 
        WHERE BADGENUMBER = @pin AND STATUS = 1
      `);
    
    return result.recordset.length > 0 ? result.recordset[0] : null;
  } catch (error) {
    console.error('❌ Error getting user by ZKTeco PIN:', error);
    return null;
  }
};

// Stop ZKTeco real-time listening
export const stopZKTecoRealtimeListening = async (req, res) => {
  try {
    const { machineId } = req.body;
    
    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: 'Machine ID is required'
      });
    }
    
    // Clear polling interval
    if (zktecoPollingIntervals.has(machineId)) {
      clearInterval(zktecoPollingIntervals.get(machineId));
      zktecoPollingIntervals.delete(machineId);
    }
    
    // Remove callback
    zktecoLoginCallbacks.delete(machineId);
    
    // Remove trackers
    zktecoLastCheckTimes.delete(machineId);
    zktecoLastProcessedTimes.delete(machineId);
    zktecoAuthResults.delete(machineId);
    
    console.log(`🛑 Stopped ZKTeco real-time listening for machine ${machineId}`);
    
    res.json({
      success: true,
      message: `Real-time listening stopped for machine ${machineId}`
    });
    
  } catch (error) {
    console.error('❌ Error stopping ZKTeco real-time listening:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop real-time listening',
      error: error.message
    });
  }
};

// Get ZKTeco real-time listening status
export const getZKTecoRealtimeStatus = async (req, res) => {
  try {
    const status = {
      activeListeners: Array.from(zktecoRealtimeListeners.keys()),
      pollingIntervals: Array.from(zktecoPollingIntervals.keys()),
      lastCheckTimes: Object.fromEntries(zktecoLastCheckTimes),
      lastProcessedTimes: Object.fromEntries(zktecoLastProcessedTimes),
      authResults: Object.fromEntries(zktecoAuthResults),
      intervalActive: zktecoPollingIntervals.size > 0,
      totalIntervals: zktecoPollingIntervals.size,
      totalListeners: zktecoRealtimeListeners.size
    };
    
    res.json({
      success: true,
      status: status
    });
    
  } catch (error) {
    console.error('❌ Error getting ZKTeco real-time status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get real-time status',
      error: error.message
    });
  }
};

// Get latest ZKTeco real-time auth result (for frontend pickup)
export const getLastZKTecoAuthResult = async (req, res) => {
  try {
    const machineId = parseInt(req.query.machineId, 10);
    if (!machineId) {
      return res.status(400).json({ success: false, message: 'machineId is required' });
    }
    const result = zktecoAuthResults.get(machineId);
    if (!result) {
      return res.json({ success: false, message: 'No auth result yet' });
    }
    // Optionally keep it (so repeated polls still see it) or clear once delivered.
    // Here we keep it until stop is called.
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error getting last ZKTeco auth result:', error);
    res.status(500).json({ success: false, message: 'Failed to get auth result', error: error.message });
  }
};

// Authenticate from ZKTeco real-time login event
export const authenticateZKTecoRealtimeLogin = async (req, res) => {
  try {
    const { machineId, userId, loginTime } = req.body;
    
    if (!machineId || !userId || !loginTime) {
      return res.status(400).json({
        success: false,
        message: 'Machine ID, User ID, and Login Time are required'
      });
    }
    
    // Get user information
    const pool = getDb();
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT USERID, NAME, BADGENUMBER, DEPARTMENT, STATUS
        FROM USERINFO 
        WHERE USERID = @userId AND STATUS = 1
      `);
    
    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userResult.recordset[0];
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        USERID: user.USERID, 
        role: 'employee',
        machineId: machineId
      },
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '8h' }
    );
    
    console.log(`✅ ZKTeco real-time authentication successful for user: ${user.NAME} (${user.BADGENUMBER})`);
    
    res.json({
      success: true,
      message: `Welcome, ${user.NAME}!`,
      user: {
        USERID: user.USERID,
        NAME: user.NAME,
        BADGENUMBER: user.BADGENUMBER,
        DEPARTMENT: user.DEPARTMENT
      },
      token: token
    });
    
  } catch (error) {
    console.error('❌ ZKTeco real-time authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Add this function to the machineController.js file

// Test endpoint to check machines table
export const testMachinesTable = async (req, res) => {
  try {
    const pool = await getDb();
    
    // Get all machines without any filtering
    const result = await pool.request().query(`
      SELECT 
        ID,
        MachineAlias,
        ConnectType,
        IP,
        Port,
        Enabled,
        SerialPort,
        Baudrate
      FROM Machines
      ORDER BY ID
    `);
    
    console.log('🔍 Machines table contents:', result.recordset);
    
    res.json({
      success: true,
      message: 'Machines table query successful',
      count: result.recordset.length,
      machines: result.recordset
    });
    
  } catch (error) {
    console.error('❌ Error testing machines table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query machines table',
      error: error.message
    });
  }
};

// Add this new debug function

export const debugMachinesConnectTypes = async (req, res) => {
  try {
    const pool = getDb();
    
    // Get all machines with their ConnectType values
    const result = await pool.request().query(`
      SELECT 
        ID,
        MachineAlias,
        ConnectType,
        IP,
        Port,
        Enabled,
        CASE 
          WHEN ConnectType = 1 THEN 'TCP/IP (Integer)'
          WHEN ConnectType = 'TCP/IP' THEN 'TCP/IP (String)'
          WHEN ConnectType = 'TCPIP' THEN 'TCPIP'
          WHEN ConnectType = 'TCP' THEN 'TCP'
          ELSE 'Other: ' + CAST(ConnectType AS VARCHAR(50))
        END as ConnectTypeDescription
      FROM Machines
      ORDER BY ID
    `);
    
    console.log('🔍 Machines ConnectType debug:', result.recordset);
    
    res.json({
      success: true,
      message: 'ConnectType debug successful',
      machines: result.recordset
    });
    
  } catch (error) {
    console.error('❌ Error debugging ConnectTypes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to debug ConnectTypes',
      error: error.message
    });
  }
};