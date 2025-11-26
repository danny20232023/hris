import sql from 'mssql';
import { getDb } from '../config/db.js';
import ZKLib from 'node-zklib';

class ZKTecoRealtimeListener {
  constructor() {
    this.activeListeners = new Map(); // Store active device listeners
    this.loginCallbacks = new Map(); // Store login event callbacks
    this.pollingIntervals = new Map(); // Store polling intervals
    this.lastCheckTimes = new Map(); // Store last check times per device
  }

  // Start real-time listening for a specific ZKTeco machine
  async startRealtimeListening(machineId, onLoginCallback) {
    try {
      const pool = getDb();
      
      // Get machine details
      const machineResult = await pool.request()
        .input('machineId', sql.Int, machineId)
        .query(`
          SELECT * FROM Machines 
          WHERE ID = @machineId AND Enabled = 1 AND ConnectType = 'TCP/IP'
        `);
      
      if (machineResult.recordset.length === 0) {
        throw new Error('ZKTeco machine not found or disabled');
      }
      
      const machine = machineResult.recordset[0];
      
      // Store callback for this machine
      this.loginCallbacks.set(machineId, onLoginCallback);
      
      // Start polling for new attendance logs
      this.startPolling(machine);
      
      console.log(`✅ Started real-time listening for ZKTeco machine: ${machine.MachineAlias}`);
      
      return {
        success: true,
        message: `Real-time listening started for ${machine.MachineAlias}`,
        machineId: machineId
      };
      
    } catch (error) {
      console.error('❌ Failed to start real-time listening:', error);
      throw error;
    }
  }

  // Start polling for new attendance logs from ZKTeco machine
  startPolling(machine) {
    const machineId = machine.ID;
    const pollInterval = 3000; // Poll every 3 seconds
    
    // Clear existing interval if any
    if (this.pollingIntervals.has(machineId)) {
      clearInterval(this.pollingIntervals.get(machineId));
    }
    
    // Set initial last check time
    this.lastCheckTimes.set(machineId, new Date());
    
    // Start polling
    const intervalId = setInterval(async () => {
      try {
        await this.checkForNewLogins(machine);
      } catch (error) {
        console.error(`❌ Polling error for machine ${machineId}:`, error);
      }
    }, pollInterval);
    
    this.pollingIntervals.set(machineId, intervalId);
    console.log(`🔄 Started polling for machine ${machineId} every ${pollInterval}ms`);
  }

  // Check for new login events from ZKTeco machine
  async checkForNewLogins(machine) {
    try {
      const machineId = machine.ID;
      const lastCheckTime = this.lastCheckTimes.get(machineId);
      const currentTime = new Date();
      
      // Connect to ZKTeco device
      const zk = new ZKLib(machine.IP, machine.Port || 4370, 10000, 10000);
      await zk.createSocket();
      
      // Get recent attendance logs (last 5 minutes)
      const fiveMinutesAgo = new Date(currentTime.getTime() - 5 * 60 * 1000);
      const attendanceLogs = await zk.getAttendance();
      
      // Filter for new logs since last check
      const newLogs = attendanceLogs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime > lastCheckTime && logTime > fiveMinutesAgo;
      });
      
      // Process new login events
      for (const log of newLogs) {
        await this.processLoginEvent(machine, log);
      }
      
      // Update last check time
      this.lastCheckTimes.set(machineId, currentTime);
      
      // Disconnect
      await zk.disconnect();
      
    } catch (error) {
      console.error(`❌ Error checking for new logins on machine ${machine.ID}:`, error);
    }
  }

  // Process a login event from ZKTeco machine
  async processLoginEvent(machine, attendanceLog) {
    try {
      const machineId = machine.ID;
      
      // Get user information by PIN (BADGENUMBER)
      const userInfo = await this.getUserByPin(attendanceLog.uid);
      
      if (userInfo) {
        // Create login event data
        const loginEvent = {
          machineId: machineId,
          machineName: machine.MachineAlias,
          userId: attendanceLog.uid,
          userName: userInfo.NAME,
          userBadge: userInfo.BADGENUMBER,
          loginTime: attendanceLog.timestamp,
          verifyMode: attendanceLog.verifyMode,
          inOutMode: attendanceLog.inOutMode,
          workCode: attendanceLog.workCode
        };
        
        console.log(`🔔 Real-time login detected: ${userInfo.NAME} (${userInfo.BADGENUMBER}) at ${machine.MachineAlias}`);
        
        // Trigger callback if registered
        const callback = this.loginCallbacks.get(machineId);
        if (callback) {
          callback(loginEvent);
        }
      } else {
        console.log(`⚠️ Unknown user PIN: ${attendanceLog.uid} on machine ${machine.MachineAlias}`);
      }
      
    } catch (error) {
      console.error('❌ Error processing login event:', error);
    }
  }

  // Get user information by PIN (BADGENUMBER)
  async getUserByPin(pin) {
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
      console.error('❌ Error getting user by PIN:', error);
      return null;
    }
  }

  // Stop real-time listening for a device
  stopRealtimeListening(machineId) {
    // Clear polling interval
    if (this.pollingIntervals.has(machineId)) {
      clearInterval(this.pollingIntervals.get(machineId));
      this.pollingIntervals.delete(machineId);
    }
    
    // Remove callback
    this.loginCallbacks.delete(machineId);
    
    // Remove last check time
    this.lastCheckTimes.delete(machineId);
    
    console.log(`🛑 Stopped real-time listening for machine ${machineId}`);
  }

  // Get active listening status
  getListeningStatus() {
    return {
      activeListeners: Array.from(this.activeListeners.keys()),
      pollingIntervals: Array.from(this.pollingIntervals.keys()),
      lastCheckTimes: Object.fromEntries(this.lastCheckTimes)
    };
  }
}

// Export singleton instance
export const zktecoRealtimeListener = new ZKTecoRealtimeListener();
export default zktecoRealtimeListener;
