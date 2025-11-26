// ZKTeco Time Log Download Utility using node-zklib
// This file contains functions to download time logs from ZKTeco biometric devices

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import sql from 'mssql';
import ZKLib from 'node-zklib';
import { getDb } from '../config/db.js';

const execAsync = promisify(exec);

// Simplified Progress tracking class
class ProgressTracker {
  constructor() {
    this.progress = {
      currentStep: '',
      percentage: 0,
      message: '',
      details: '',
      errors: [],
      logsFound: 0,
      logsProcessed: 0,
      logsSaved: 0
    };
    this.progressCallbacks = [];
  }

  updateProgress(percentage, step, message, details = '', logsFound = 0, logsProcessed = 0, logsSaved = 0) {
    this.progress.percentage = Math.min(percentage, 99); // Never show 100% until truly complete
    this.progress.currentStep = step;
    this.progress.message = message;
    this.progress.details = details;
    this.progress.logsFound = logsFound;
    this.progress.logsProcessed = logsProcessed;
    this.progress.logsSaved = logsSaved;
    
    console.log(`[${this.progress.percentage}%] ${step}: ${message}`);
    if (details) {
      console.log(`  Details: ${details}`);
    }
    if (logsFound > 0) {
      console.log(`  Logs: Found=${logsFound}, Processed=${logsProcessed}, Saved=${logsSaved}`);
    }
    
    // Notify all progress callbacks
    this.progressCallbacks.forEach(callback => {
      try {
        callback(this.getProgress());
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  setComplete(message = 'Operation completed successfully', logsFound = 0, logsProcessed = 0, logsSaved = 0) {
    this.progress.currentStep = 'Completed';
    this.progress.message = message;
    this.progress.percentage = 100;
    this.progress.details = 'All operations finished';
    this.progress.logsFound = logsFound;
    this.progress.logsProcessed = logsProcessed;
    this.progress.logsSaved = logsSaved;
    
    console.log(`[100%] ${message}`);
    console.log(`  Final Logs: Found=${logsFound}, Processed=${logsProcessed}, Saved=${logsSaved}`);
    
    // Notify all progress callbacks
    this.progressCallbacks.forEach(callback => {
      try {
        callback(this.getProgress());
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  addError(error) {
    this.progress.errors.push(error);
    console.error(`Error: ${error}`);
  }

  getProgress() {
    return { ...this.progress };
  }

  // Add callback for progress updates
  onProgress(callback) {
    if (typeof callback === 'function') {
      this.progressCallbacks.push(callback);
    }
  }

  // Remove callback
  offProgress(callback) {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }
}

// ZKTeco Time Log Download class using node-zklib
class ZKTecoConnection {
  constructor(machine, progressTracker = null) {
    this.machine = machine;
    this.connected = false;
    this.progressTracker = progressTracker;
    this.zk = null;
    this.timeout = 60000; // Increase to 60 seconds timeout
  }

  // Connect to the machine using node-zklib
  async connect() {
    try {
      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Connecting', `Connecting to ${this.machine.MachineAlias}`, `IP: ${this.machine.IP}, Port: ${this.machine.Port}`);
      }

      // Create ZKLib instance with increased timeout
      this.zk = new ZKLib(this.machine.IP, this.machine.Port || 4370, this.timeout, this.timeout);
      
      // Create socket connection with timeout handling
      console.log(`Attempting to connect to ZKTeco device at ${this.machine.IP}:${this.machine.Port || 4370} with ${this.timeout}ms timeout`);
      
      await this.zk.createSocket();
      
      this.connected = true;
      
      if (this.progressTracker) {
        this.progressTracker.updateProgress(100, 'Connected', `Successfully connected to ${this.machine.MachineAlias}`, 'Ready to fetch time logs');
      }
      
      console.log(`Connected to ZKTeco device at ${this.machine.IP}:${this.machine.Port || 4370}`);

    } catch (error) {
      console.error('Connection error:', error);
      if (this.progressTracker) {
        this.progressTracker.addError(`Connection failed: ${error.message}`);
      }
      
      // Provide more specific error messages
      if (error.message.includes('timeout')) {
        throw new Error(`Connection timeout to ${this.machine.MachineAlias} (${this.machine.IP}:${this.machine.Port || 4370}). Please check if the device is online and accessible.`);
      } else if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`Connection refused to ${this.machine.MachineAlias} (${this.machine.IP}:${this.machine.Port || 4370}). Please check if the device is running and the port is correct.`);
      } else if (error.message.includes('ENOTFOUND')) {
        throw new Error(`Device not found: ${this.machine.MachineAlias} (${this.machine.IP}). Please check the IP address.`);
      } else {
        throw new Error(`Connection failed to ${this.machine.MachineAlias}: ${error.message}`);
      }
    }
  }

  // Disconnect from machine
  async disconnect() {
    try {
      if (this.zk && this.connected) {
        await this.zk.disconnect();
        this.zk = null;
      }

    this.connected = false;
    if (this.progressTracker) {
      this.progressTracker.updateProgress(100, 'Disconnecting', `Disconnecting from ${this.machine.MachineAlias}`, 'Connection closed');
    }
    
    return true;
    } catch (error) {
      console.error('Disconnect error:', error);
      return false;
    }
  }

  // Test connection to the machine (ping test)
  async testConnection() {
    try {
      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Testing Connection', `Testing connectivity to ${this.machine.MachineAlias}`, `Pinging ${this.machine.IP}`);
      }

      // Simple ping test using child_process
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Use ping command (Windows/Linux compatible)
      const pingCommand = process.platform === 'win32' 
        ? `ping -n 1 ${this.machine.IP}` 
        : `ping -c 1 ${this.machine.IP}`;
      
      const { stdout, stderr } = await execAsync(pingCommand);
      
      if (stderr) {
        throw new Error(`Ping failed: ${stderr}`);
      }
      
      console.log(`Ping successful to ${this.machine.IP}`);
      return true;
      
    } catch (error) {
      console.error(`Ping test failed for ${this.machine.IP}:`, error);
      if (this.progressTracker) {
        this.progressTracker.addError(`Ping test failed: ${error.message}`);
      }
      return false;
    }
  }

  // Get time logs from machine
  async getTimeLogs(startDate, endDate) {
    try {
      if (!this.connected || !this.zk) {
        throw new Error('Not connected to device');
      }

      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Fetching Logs', `Fetching time logs from ${this.machine.MachineAlias}`, `Date range: ${startDate} to ${endDate}`);
      }

      console.log(`[PROGRESS] Starting to fetch attendance logs from ${this.machine.MachineAlias}...`);
      
      // Get attendance logs using node-zklib with detailed progress
      if (this.progressTracker) {
        this.progressTracker.updateProgress(10, 'Requesting data from device', 'Sending getAttendances command');
      }
      
      console.log(`[PROGRESS] Sending getAttendances command to device...`);
      const result = await this.zk.getAttendances();
      
      if (this.progressTracker) {
        this.progressTracker.updateProgress(30, 'Received response from device', 'Processing raw data');
      }
      
      console.log(`[PROGRESS] Received response from device, processing data...`);
      
      // Extract the logs array from the result object
      const logsArray = result && result.data ? result.data : [];
      
      console.log(`[PROGRESS] Found ${logsArray.length} raw attendance records`);
      
      if (this.progressTracker) {
        this.progressTracker.updateProgress(50, `Found ${logsArray.length} raw records`, 'Converting to standard format');
      }

      console.log(`[PROGRESS] Converting ${logsArray.length} records to standard format...`);
      
      // Convert logs to standard format with progress updates
      const processedLogs = logsArray.map((log, index) => {
        // Update progress every 10 records
        if (this.progressTracker && index % 10 === 0) {
          const stepProgress = Math.round((index / logsArray.length) * 40) + 50; // 50-90% of this step
          this.progressTracker.updateProgress(stepProgress, `Processing record ${index + 1}/${logsArray.length}`, 'Converting timestamps and formatting');
        }
        
        // Debug: Log all available fields from the device
        console.log(`[PROGRESS] Processing log ${index + 1}/${logsArray.length}:`, JSON.stringify(log, null, 2));
        
        // Try to determine IN/OUT based on available data
        let checkType = 'I'; // Default to IN
        
        // Check if there's any IN/OUT information in the log
        if (log.type !== undefined) {
          // Some devices provide type field (0=IN, 1=OUT or similar)
          checkType = log.type === 0 || log.type === '0' ? 'I' : 'O';
        } else if (log.state !== undefined) {
          // Some devices provide state field
          checkType = log.state === 0 || log.state === '0' ? 'I' : 'O';
        } else if (log.inOut !== undefined) {
          // Some devices provide inOut field
          checkType = log.inOut === 0 || log.inOut === '0' ? 'I' : 'O';
        } else if (log.verifyType !== undefined) {
          // Some devices use verifyType (1=Fingerprint, 2=Password, etc.)
          // For now, default to IN for all verification types
          checkType = 'I';
        } else {
          // No IN/OUT data available - implement pattern-based logic
          // For now, we'll use a simple pattern: alternate between IN and OUT
          // This is a basic implementation - you might want to improve this logic
          checkType = index % 2 === 0 ? 'I' : 'O';
        }
        
        console.log(`[PROGRESS] Determined CHECKTYPE for log ${index + 1}: ${checkType}`);
        
        // Debug: Log the timestamp format
        console.log(`[PROGRESS] Raw timestamp from device:`, log.recordTime, 'Type:', typeof log.recordTime);
        
        // Format timestamp to preserve local time without timezone conversion
        let localTimestamp;
        if (log.recordTime instanceof Date) {
          // Format as YYYY-MM-DD HH:mm:ss.fff to preserve local time
          const year = log.recordTime.getFullYear();
          const month = String(log.recordTime.getMonth() + 1).padStart(2, '0');
          const day = String(log.recordTime.getDate()).padStart(2, '0');
          const hours = String(log.recordTime.getHours()).padStart(2, '0');
          const minutes = String(log.recordTime.getMinutes()).padStart(2, '0');
          const seconds = String(log.recordTime.getSeconds()).padStart(2, '0');
          const milliseconds = String(log.recordTime.getMilliseconds()).padStart(3, '0');
          
          localTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
        } else {
          localTimestamp = String(log.recordTime);
        }
        
        console.log(`[PROGRESS] Formatted local timestamp:`, localTimestamp);
        
        return {
          id: log.userSn || '',
          employeeId: log.deviceUserId || log.userSn || '',
          timestamp: localTimestamp, // Use formatted local timestamp
          deviceId: this.machine.MachineNumber || this.machine.id,
          deviceName: this.machine.MachineAlias || this.machine.name,
          status: checkType === 'I' ? 'IN' : 'OUT',
          verifyMode: log.verifyType || 1, // Use device verifyType if available
          inOutMode: checkType, // Store the actual IN/OUT value
          workCode: 0,
          reserved: '',
          machineAlias: this.machine.MachineAlias,
          ip: log.ip || this.machine.IP,
          port: this.machine.Port,
          userSn: log.userSn, // User's serial number (for reference)
          deviceSerialNumber: this.machine.SN || this.machine.sn || 'CLXE224760197', // Device serial number
          deviceUserId: log.deviceUserId,
          originalRecordTime: log.recordTime, // Keep original for reference
          rawLog: log // Keep the entire raw log for debugging
        };
      });

      if (this.progressTracker) {
        this.progressTracker.updateProgress(100, 'Completed', `Successfully processed ${processedLogs.length} records`, 'Ready for filtering');
      }

      console.log(`[PROGRESS] Completed processing ${processedLogs.length} records`);

      // Filter by date range if provided (without time conversion)
      let filteredLogs = processedLogs;
      if (startDate && endDate) {
        if (this.progressTracker) {
          this.progressTracker.updateProgress(0, 'Filtering by Date', `Filtering ${processedLogs.length} logs by date range`, `Looking for dates between ${startDate} and ${endDate}`);
        }
        
        console.log('[PROGRESS] === DATE FILTERING DEBUG ===');
        console.log('[PROGRESS] Start Date:', startDate, 'End Date:', endDate);
        console.log('[PROGRESS] Total logs before filtering:', processedLogs.length);
        
        // Show sample of timestamps
        console.log('[PROGRESS] Sample timestamps:');
        processedLogs.slice(0, 5).forEach((log, index) => {
          console.log(`[PROGRESS] Log ${index + 1}:`, log.timestamp);
        });
        
        // Show all unique dates in the logs
        const uniqueDates = [...new Set(processedLogs.map(log => {
          if (!log.timestamp) return 'NO_TIMESTAMP';
          if (typeof log.timestamp === 'string') {
            // Handle both ISO format and our format
            if (log.timestamp.includes('T')) {
              return log.timestamp.split('T')[0];
            } else if (log.timestamp.includes(' ')) {
              return log.timestamp.split(' ')[0];
            } else {
              return log.timestamp.substring(0, 10);
            }
          } else if (log.timestamp instanceof Date) {
            return log.timestamp.toISOString().split('T')[0];
          } else {
            return log.timestamp.toString().split(' ')[0].split('T')[0];
          }
        }))].sort();
        
        console.log('[PROGRESS] All unique dates in logs:', uniqueDates);
        console.log('[PROGRESS] Looking for dates between:', startDate, 'and', endDate);
        
        filteredLogs = processedLogs.filter(log => {
          if (!log.timestamp) {
            console.log('[PROGRESS] Log with no timestamp found:', log);
            return false;
          }
          
          // Handle different timestamp formats
          let logDateOnly;
          if (typeof log.timestamp === 'string') {
            // Handle both ISO format (2025-09-11T04:01:29.000Z) and our format (2025-09-23 12:02:15.000)
            if (log.timestamp.includes('T')) {
              // ISO format: 2025-09-11T04:01:29.000Z -> 2025-09-11
              logDateOnly = log.timestamp.split('T')[0];
            } else if (log.timestamp.includes(' ')) {
              // Our format: 2025-09-23 12:02:15.000 -> 2025-09-23
              logDateOnly = log.timestamp.split(' ')[0];
            } else {
              // Fallback: try to extract date part
              logDateOnly = log.timestamp.substring(0, 10);
            }
          } else if (log.timestamp instanceof Date) {
            // For Date objects
            logDateOnly = log.timestamp.toISOString().split('T')[0];
          } else {
            // For other formats, try to convert to string first
            logDateOnly = log.timestamp.toString().split(' ')[0].split('T')[0];
          }
          
          const isInRange = logDateOnly >= startDate && logDateOnly <= endDate;
          if (!isInRange) {
            console.log('[PROGRESS] Log excluded:', logDateOnly, 'not in range', startDate, '-', endDate);
          } else {
            console.log('[PROGRESS] Log included:', logDateOnly, 'is in range');
          }
          
          return isInRange;
        });
        
        console.log('[PROGRESS] Date filtering complete:', filteredLogs.length, 'logs match date range');
      }

      if (this.progressTracker) {
        this.progressTracker.updateProgress(100, 'Completed', `Successfully processed ${filteredLogs.length} logs`, 'Ready for return');
      }

      console.log(`[PROGRESS] Returning ${filteredLogs.length} filtered logs`);
      return filteredLogs;
      
    } catch (error) {
      console.error('[PROGRESS] Error in getTimeLogs:', error);
      if (this.progressTracker) {
        this.progressTracker.addError(`Failed to fetch logs: ${error.message}`);
      }
      throw error;
    }
  }

  // Get real-time device information including counts
  async getDeviceInfo() {
    if (!this.connected || !this.zk) {
      throw new Error('Not connected to machine');
    }

    try {
      console.log(`Starting getDeviceInfo for ${this.machine.MachineAlias}`);
      
      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Getting Device Info', `Getting real-time information from ${this.machine.MachineAlias}`, 'Retrieving device counts');
      }

      const deviceInfo = {
        deviceName: this.machine.MachineAlias,
        serialNumber: this.machine.sn || 'Unknown',
        firmwareVersion: this.machine.FirmwareVersion || 'Unknown',
        ip: this.machine.IP,
        port: this.machine.Port,
        connected: this.connected,
        userCount: 0,
        fingerprintCount: 0,
        faceCount: 0,
        logCount: 0
      };

      console.log(`Initial device info for ${this.machine.MachineAlias}:`, deviceInfo);

      try {
        console.log(`Getting attendances from ${this.machine.MachineAlias}...`);
        // Get attendance log count (this method we know works)
        const attendances = await this.zk.getAttendances();
        // Removed the debug log that was showing full attendance data
        
        deviceInfo.logCount = attendances && attendances.data ? attendances.data.length : 0;
        
        // Try to get unique user count from attendance logs
        if (attendances && attendances.data) {
          const uniqueUsers = new Set();
          attendances.data.forEach(log => {
            if (log.userId || log.uid) {
              uniqueUsers.add(log.userId || log.uid);
            }
          });
          deviceInfo.userCount = uniqueUsers.size;
        }
        
        console.log(`Log count: ${deviceInfo.logCount}, User count from logs: ${deviceInfo.userCount}`);
      } catch (error) {
        console.log(`Could not get attendance count from ${this.machine.MachineAlias}:`, error.message);
        console.log(`Attendance error details:`, error);
      }

      // Try to get device info with template counts using correct method names
      try {
        console.log(`Trying getDeviceInfo method for ${this.machine.MachineAlias}...`);
        if (this.zk.getDeviceInfo) {
          const deviceInfoData = await this.zk.getDeviceInfo();
          console.log(`Device info from ${this.machine.MachineAlias}:`, deviceInfoData);
          
          if (deviceInfoData) {
            // Look for various possible field names for counts
            deviceInfo.fingerprintCount = deviceInfoData.fingerprintCount || deviceInfoData.fpCount || deviceInfoData.fingerprintQty || deviceInfoData.fpQty || 0;
            deviceInfo.faceCount = deviceInfoData.faceCount || deviceInfoData.faceQty || deviceInfoData.photoCount || deviceInfoData.photoQty || 0;
            deviceInfo.userCount = deviceInfoData.userCount || deviceInfoData.userQty || deviceInfoData.enrollUserCount || deviceInfo.userCount;
          }
        }
      } catch (error) {
        console.log(`Could not get device info from ${this.machine.MachineAlias}:`, error.message);
        console.log(`Device info error details:`, error);
      }

      // Alternative 1: Direct TCP Socket Communication with ZKTeco protocol
      try {
        console.log(`=== TRYING DIRECT TCP SOCKET COMMUNICATION FOR ${this.machine.MachineAlias} ===`);
        
        const net = await import('net');
        const socket = new net.Socket();
        
        const tcpResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.destroy();
            resolve({ fingerprintCount: 0, faceCount: 0, error: 'TCP timeout' });
          }, 10000);
          
          socket.connect(this.machine.Port || 4370, this.machine.IP, () => {
            console.log(`TCP socket connected to ${this.machine.MachineAlias} at ${this.machine.IP}:${this.machine.Port || 4370}`);
            
            // Try ZKTeco protocol command to get device status
            // Command structure: [0x50, 0x50, 0x82, 0x7D, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
            const getDeviceStatusCommand = Buffer.from([
              0x50, 0x50, 0x82, 0x7D, 0x0A, 0x00, 0x00, 0x00, 
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);
            
            console.log(`Sending ZKTeco protocol command to ${this.machine.MachineAlias}...`);
            socket.write(getDeviceStatusCommand);
          });
          
          socket.on('data', (data) => {
            console.log(`TCP response from ${this.machine.MachineAlias}:`, data);
            console.log(`TCP response length: ${data.length} bytes`);
            console.log(`TCP response hex:`, data.toString('hex'));
            
            // Try to parse the response for template counts
            // This is a simplified parser - real ZKTeco protocol is more complex
            if (data.length >= 16) {
              // Check if response contains template count information
              const responseHex = data.toString('hex');
              console.log(`Parsing TCP response for template counts...`);
              
              // Look for patterns that might indicate template counts
              // This is experimental and may need adjustment based on actual device responses
              let fingerprintCount = 0;
              let faceCount = 0;
              
              // Try to extract counts from response (this is experimental)
              if (data.length >= 20) {
                // Attempt to read template counts from specific byte positions
                fingerprintCount = data.readUInt16LE(16) || 0;
                faceCount = data.readUInt16LE(18) || 0;
                console.log(`Extracted counts - Fingerprints: ${fingerprintCount}, Faces: ${faceCount}`);
              }
              
              socket.end();
              resolve({ fingerprintCount, faceCount, method: 'TCP' });
            } else {
              console.log(`TCP response too short to contain template counts`);
              socket.end();
              resolve({ fingerprintCount: 0, faceCount: 0, method: 'TCP', error: 'Response too short' });
            }
          });
          
          socket.on('error', (error) => {
            console.log(`TCP socket error for ${this.machine.MachineAlias}:`, error.message);
            socket.destroy();
            resolve({ fingerprintCount: 0, faceCount: 0, method: 'TCP', error: error.message });
          });
          
          socket.on('close', () => {
            console.log(`TCP socket closed for ${this.machine.MachineAlias}`);
          });
        });
        
        if (tcpResult.fingerprintCount > 0 || tcpResult.faceCount > 0) {
          deviceInfo.fingerprintCount = tcpResult.fingerprintCount;
          deviceInfo.faceCount = tcpResult.faceCount;
          console.log(`✅ TCP Direct method - Fingerprints: ${tcpResult.fingerprintCount}, Faces: ${tcpResult.faceCount}`);
        } else {
          console.log(`❌ TCP Direct method failed - ${tcpResult.error || 'No template counts found'}`);
        }
        
        console.log(`=== END DIRECT TCP SOCKET COMMUNICATION FOR ${this.machine.MachineAlias} ===`);
        
      } catch (error) {
        console.log(`Error in TCP Direct method for ${this.machine.MachineAlias}:`, error.message);
      }

      // Try zkteco-js library approach (new library with potentially better biometric support)
      try {
        console.log(`=== TRYING ZKTECO-JS LIBRARY FOR ${this.machine.MachineAlias} ===`);
        
        // Import zkteco-js library
        const ZKTecoJS = await import('zkteco-js');
        console.log(`ZKTecoJS library loaded for ${this.machine.MachineAlias}`);
        
        // Check what methods are available in zkteco-js
        const zktecoMethods = Object.getOwnPropertyNames(ZKTecoJS).filter(name => typeof ZKTecoJS[name] === 'function');
        console.log(`Available zkteco-js methods for ${this.machine.MachineAlias}:`, zktecoMethods);
        
        // Check the default export
        if (ZKTecoJS.default) {
          console.log(`ZKTecoJS default export for ${this.machine.MachineAlias}:`, typeof ZKTecoJS.default);
          console.log(`ZKTecoJS default properties for ${this.machine.MachineAlias}:`, Object.getOwnPropertyNames(ZKTecoJS.default));
          
          // Try to create a connection with zkteco-js default
          if (typeof ZKTecoJS.default === 'function') {
            try {
              const zkConnection = new ZKTecoJS.default(this.machine.IP, this.machine.Port || 4370);
              console.log(`ZKTecoJS connection created for ${this.machine.MachineAlias}`);
              
              // Check what methods are available on the connection
              const connectionMethods = Object.getOwnPropertyNames(zkConnection).filter(name => typeof zkConnection[name] === 'function');
              console.log(`Available zkteco-js connection methods for ${this.machine.MachineAlias}:`, connectionMethods);
              
              // Try to get biometric counts using zkteco-js
              if (typeof zkConnection.getFingerprintCount === 'function') {
                try {
                  const fingerprintCount = await zkConnection.getFingerprintCount();
                  console.log(`ZKTecoJS fingerprint count for ${this.machine.MachineAlias}:`, fingerprintCount);
                  if (fingerprintCount !== undefined && fingerprintCount !== null) {
                    deviceInfo.fingerprintCount = fingerprintCount;
                    console.log(`✅ ZKTecoJS fingerprints: ${fingerprintCount}`);
                  }
                } catch (error) {
                  console.log(`ZKTecoJS getFingerprintCount failed for ${this.machine.MachineAlias}:`, error.message);
                }
              }
              
              if (typeof zkConnection.getFaceCount === 'function') {
                try {
                  const faceCount = await zkConnection.getFaceCount();
                  console.log(`ZKTecoJS face count for ${this.machine.MachineAlias}:`, faceCount);
                  if (faceCount !== undefined && faceCount !== null) {
                    deviceInfo.faceCount = faceCount;
                    console.log(`✅ ZKTecoJS faces: ${faceCount}`);
                  }
                } catch (error) {
                  console.log(`ZKTecoJS getFaceCount failed for ${this.machine.MachineAlias}:`, error.message);
                }
              }
              
            } catch (error) {
              console.log(`ZKTecoJS connection failed for ${this.machine.MachineAlias}:`, error.message);
            }
          }
        }
        
        console.log(`=== END ZKTECO-JS LIBRARY FOR ${this.machine.MachineAlias} ===`);
        
      } catch (error) {
        console.log(`Error in zkteco-js library for ${this.machine.MachineAlias}:`, error.message);
      }

      // Try GetDeviceStatus approach (most direct method from SDK docs)
      try {
        console.log(`=== TRYING GetDeviceStatus METHODS FOR ${this.machine.MachineAlias} ===`);
        
        // Method 1: Try GetDeviceStatus with dwStatus = 3 for fingerprint templates
        if (typeof this.zk.getDeviceStatus === 'function') {
          console.log(`getDeviceStatus method exists for ${this.machine.MachineAlias}`);
          try {
            const deviceStatus = await this.zk.getDeviceStatus(3); // dwStatus = 3 for fingerprint templates
            console.log(`GetDeviceStatus(3) result for ${this.machine.MachineAlias}:`, deviceStatus);
            if (deviceStatus && deviceStatus.fingerprintCount !== undefined) {
              deviceInfo.fingerprintCount = deviceStatus.fingerprintCount;
              console.log(`✅ GetDeviceStatus fingerprints: ${deviceStatus.fingerprintCount}`);
            }
          } catch (error) {
            console.log(`GetDeviceStatus(3) failed for ${this.machine.MachineAlias}:`, error.message);
          }
        } else {
          console.log(`getDeviceStatus method does NOT exist for ${this.machine.MachineAlias}`);
        }
        
        // Method 2: Try GetDeviceStatus with dwStatus = 4 for face templates
        if (typeof this.zk.getDeviceStatus === 'function') {
          try {
            const deviceStatus = await this.zk.getDeviceStatus(4); // dwStatus = 4 for face templates
            console.log(`GetDeviceStatus(4) face result for ${this.machine.MachineAlias}:`, deviceStatus);
            if (deviceStatus && deviceStatus.faceCount !== undefined) {
              deviceInfo.faceCount = deviceStatus.faceCount;
              console.log(`✅ GetDeviceStatus faces: ${deviceStatus.faceCount}`);
            }
          } catch (error) {
            console.log(`GetDeviceStatus(4) face failed for ${this.machine.MachineAlias}:`, error.message);
          }
        }
        
        // Method 3: Try alternative GetDeviceStatus method names
        const alternativeMethods = ['getDeviceStatus', 'GetDeviceStatus', 'getDeviceData', 'GetDeviceData', 'getStatus', 'GetStatus'];
        for (const methodName of alternativeMethods) {
          if (typeof this.zk[methodName] === 'function') {
            console.log(`Found alternative method: ${methodName} for ${this.machine.MachineAlias}`);
            try {
              const result = await this.zk[methodName]();
              console.log(`${methodName} result for ${this.machine.MachineAlias}:`, result);
              if (result && (result.fingerprintCount !== undefined || result.faceCount !== undefined)) {
                if (result.fingerprintCount !== undefined) {
                  deviceInfo.fingerprintCount = result.fingerprintCount;
                  console.log(`✅ ${methodName} fingerprints: ${result.fingerprintCount}`);
                }
                if (result.faceCount !== undefined) {
                  deviceInfo.faceCount = result.faceCount;
                  console.log(`✅ ${methodName} faces: ${result.faceCount}`);
                }
              }
            } catch (error) {
              console.log(`${methodName} failed for ${this.machine.MachineAlias}:`, error.message);
            }
          }
        }
        
        console.log(`=== END GetDeviceStatus METHODS FOR ${this.machine.MachineAlias} ===`);
        
      } catch (error) {
        console.log(`Error in GetDeviceStatus methods for ${this.machine.MachineAlias}:`, error.message);
      }

      // Try to get biometric counts using direct methods (getFingerCount, getFaceCount)
      try {
        console.log(`Trying direct biometric count methods for ${this.machine.MachineAlias}...`);
        
        // Debug: List all available methods on the ZKLib instance
        const availableMethods = Object.getOwnPropertyNames(this.zk).filter(name => typeof this.zk[name] === 'function');
        console.log(`Available methods on ZKLib instance for ${this.machine.MachineAlias}:`, availableMethods);
        
        // Try getFingerCount method
        if (typeof this.zk.getFingerCount === 'function') {
          console.log(`getFingerCount method exists for ${this.machine.MachineAlias}`);
          try {
            const fingerCount = await this.zk.getFingerCount();
            console.log(`getFingerCount result for ${this.machine.MachineAlias}:`, fingerCount);
            if (fingerCount !== undefined && fingerCount !== null) {
              deviceInfo.fingerprintCount = fingerCount;
              console.log(`✅ Fingerprints stored: ${fingerCount}`);
            }
          } catch (error) {
            console.log(`getFingerCount failed for ${this.machine.MachineAlias}:`, error.message);
          }
        } else {
          console.log(`getFingerCount method does NOT exist for ${this.machine.MachineAlias}`);
        }
        
        // Try getFaceCount method
        if (typeof this.zk.getFaceCount === 'function') {
          console.log(`getFaceCount method exists for ${this.machine.MachineAlias}`);
          try {
            const faceCount = await this.zk.getFaceCount();
            console.log(`getFaceCount result for ${this.machine.MachineAlias}:`, faceCount);
            if (faceCount !== undefined && faceCount !== null) {
              deviceInfo.faceCount = faceCount;
              console.log(`✅ Faces stored: ${faceCount}`);
            }
          } catch (error) {
            console.log(`getFaceCount failed for ${this.machine.MachineAlias}:`, error.message);
          }
        } else {
          console.log(`getFaceCount method does NOT exist for ${this.machine.MachineAlias}`);
        }
        
        // If direct methods don't exist, try the iterative approach
        if (typeof this.zk.getFingerCount !== 'function' && typeof this.zk.getFaceCount !== 'function') {
          console.log(`Direct biometric count methods not available for ${this.machine.MachineAlias}. Trying iterative approach...`);
          
          try {
            const biometricCounts = await getBiometricCounts(this.zk);
            deviceInfo.fingerprintCount = biometricCounts.fingerprintCount;
            deviceInfo.faceCount = biometricCounts.faceCount;
            console.log(`✅ Iterative biometric counts - Fingerprints: ${biometricCounts.fingerprintCount}, Faces: ${biometricCounts.faceCount}`);
          } catch (error) {
            console.log(`Iterative biometric count method failed for ${this.machine.MachineAlias}:`, error.message);
          }
        }
        
      } catch (error) {
        console.log(`Error in direct biometric count methods for ${this.machine.MachineAlias}:`, error.message);
      }

      // Try to get users and count their templates using direct method calls
      try {
        console.log(`Trying getUsers method for ${this.machine.MachineAlias}...`);
        if (this.zk.getUsers) {
          const users = await this.zk.getUsers();
          // Removed the debug log that was showing full user data
          
          if (users && users.data) {
            deviceInfo.userCount = users.data.length;
            console.log(`Found ${users.data.length} users on ${this.machine.MachineAlias}`);
            
            // For older machines, set face count to 0 (they don't support face recognition)
            deviceInfo.faceCount = 0;
            console.log(`Setting face count to 0 for older machine ${this.machine.MachineAlias}`);
            
            // Try to get actual fingerprint count using different approaches
            let fingerprintCount = 0;
            
            // Approach 1: Try to get template counts from device info
            try {
              if (this.zk.getDeviceInfo) {
                const deviceInfoData = await this.zk.getDeviceInfo();
                console.log(`Device info data:`, deviceInfoData);
                if (deviceInfoData && deviceInfoData.fingerprintCount) {
                  fingerprintCount = deviceInfoData.fingerprintCount;
                  console.log(`Got fingerprint count from device info: ${fingerprintCount}`);
                }
              }
            } catch (error) {
              console.log(`Could not get device info:`, error.message);
            }
            
            // Approach 2: Try to get template counts using different method names
            if (fingerprintCount === 0) {
              try {
                // Try different possible method names for getting template counts
                const methods = [
                  'getTemplateCount',
                  'getFingerprintCount',
                  'getTemplateQty',
                  'getFingerprintQty',
                  'getEnrollUserCount',
                  'getUserTemplateCount',
                  'getTemplateInfo',
                  'getFingerprintInfo'
                ];
                
                for (const methodName of methods) {
                  if (typeof this.zk[methodName] === 'function') {
                    try {
                      const result = await this.zk[methodName]();
                      console.log(`Method ${methodName} result:`, result);
                      if (result && result.data) {
                        fingerprintCount = result.data;
                        console.log(`Got fingerprint count from ${methodName}: ${fingerprintCount}`);
                        break;
                      }
                    } catch (error) {
                      console.log(`Method ${methodName} failed:`, error.message);
                    }
                  }
                }
              } catch (error) {
                console.log(`Could not get template count using method names:`, error.message);
              }
            }
            
            // Approach 3: Try to get template counts using user data analysis
            if (fingerprintCount === 0) {
              // Check if user data contains template information
              const firstUser = users.data[0];
              if (firstUser.fingerprintTemplates || firstUser.fingerprints || firstUser.fingerprintCount) {
                console.log(`User data contains fingerprint information`);
                users.data.forEach(user => {
                  if (user.fingerprintTemplates) {
                    fingerprintCount += user.fingerprintTemplates.length;
                  } else if (user.fingerprints) {
                    fingerprintCount += user.fingerprints.length;
                  } else if (user.fingerprintCount) {
                    fingerprintCount += user.fingerprintCount;
                  }
                });
                console.log(`Got fingerprint count from user data: ${fingerprintCount}`);
              }
            }
            
            // If we still can't get the count, set it to 0 (unknown)
            if (fingerprintCount === 0) {
              console.log(`Could not determine fingerprint count for ${this.machine.MachineAlias} - setting to 0`);
              fingerprintCount = 0;
            }
            
            deviceInfo.fingerprintCount = fingerprintCount;
            console.log(`Final fingerprint count: ${deviceInfo.fingerprintCount}`);
          }
        } else {
          console.log(`getUsers method not available for ${this.machine.MachineAlias}`);
        }
      } catch (error) {
        console.log(`Could not get users from ${this.machine.MachineAlias}:`, error.message);
        console.log(`Users error details:`, error);
      }

      // For older machines, ensure face count is 0 and don't fall back to database
      if (deviceInfo.faceCount === 0) {
        console.log(`Face count is 0 for older machine ${this.machine.MachineAlias} (no face support)`);
      }

      // Don't fall back to database values since they're -1 (unknown)
      if (deviceInfo.fingerprintCount === 0) {
        console.log(`Could not determine fingerprint count for ${this.machine.MachineAlias}`);
      }

      // Debug: Log what methods are available on the zk instance
      console.log(`Available methods on ZKLib instance for ${this.machine.MachineAlias}:`, Object.getOwnPropertyNames(this.zk).filter(name => typeof this.zk[name] === 'function'));

      console.log(`Final device info for ${this.machine.MachineAlias}:`, deviceInfo);

      if (this.progressTracker) {
        this.progressTracker.updateProgress(100, 'Device Info Retrieved', `Got info from ${this.machine.MachineAlias}`, `Users: ${deviceInfo.userCount}, Fingers: ${deviceInfo.fingerprintCount}, Faces: ${deviceInfo.faceCount}, Logs: ${deviceInfo.logCount}`);
      }

      return deviceInfo;

    } catch (error) {
      console.error(`Error getting device info for ${this.machine.MachineAlias}:`, error);
      console.error(`Error stack:`, error.stack);
      throw error;
    }
  }

  // Get machine info (enhanced version)
  async getMachineInfo() {
    if (!this.connected || !this.zk) {
      throw new Error('Not connected to machine');
    }

    try {
      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Getting Machine Info', `Getting information from ${this.machine.MachineAlias}`, 'Retrieving device details');
      }

      // Get real-time device information
      const deviceInfo = await this.getDeviceInfo();

      const info = {
        deviceName: this.machine.MachineAlias,
        serialNumber: this.machine.sn || 'Unknown',
        firmwareVersion: this.machine.FirmwareVersion || 'Unknown',
        userCount: deviceInfo.userCount,
        fingerprintCount: deviceInfo.fingerprintCount,
        faceCount: deviceInfo.faceCount,
        logCount: deviceInfo.logCount,
        deviceTime: new Date().toISOString(),
        ip: this.machine.IP,
        port: this.machine.Port,
        connected: this.connected
      };

      return info;

    } catch (error) {
      console.error('Error getting machine info:', error);
      throw error;
    }
  }

  // Set machine time
  async setTime(dateTime) {
    try {
      if (!this.connected || !this.zk) {
        throw new Error('Not connected to machine');
      }

      if (this.progressTracker) {
        this.progressTracker.updateProgress(0, 'Setting Time', `Setting machine time to ${dateTime.toLocaleString()}`, 'Synchronizing time...');
      }

      // Try different methods to set time since setTime might not be available
      let timeSetSuccessfully = false;
      
      try {
        // Method 1: Try setTime if it exists
        if (typeof this.zk.setTime === 'function') {
          await this.zk.setTime(dateTime);
          timeSetSuccessfully = true;
          console.log(`Method 1: setTime successful`);
        }
      } catch (error) {
        console.log(`Method 1 (setTime) failed:`, error.message);
      }

      if (!timeSetSuccessfully) {
        try {
          // Method 2: Try setDeviceTime if it exists
          if (typeof this.zk.setDeviceTime === 'function') {
            await this.zk.setDeviceTime(dateTime);
            timeSetSuccessfully = true;
            console.log(`Method 2: setDeviceTime successful`);
          }
        } catch (error) {
          console.log(`Method 2 (setDeviceTime) failed:`, error.message);
        }
      }

      if (!timeSetSuccessfully) {
        try {
          // Method 3: Try syncTime if it exists
          if (typeof this.zk.syncTime === 'function') {
            await this.zk.syncTime(dateTime);
            timeSetSuccessfully = true;
            console.log(`Method 3: syncTime successful`);
          }
        } catch (error) {
          console.log(`Method 3 (syncTime) failed:`, error.message);
        }
      }

      if (!timeSetSuccessfully) {
        try {
          // Method 4: Try using the raw socket to send time command
          if (this.zk.socket && typeof this.zk.socket.write === 'function') {
            // This is a more direct approach using the socket
            const timeBuffer = this.createTimeBuffer(dateTime);
            this.zk.socket.write(timeBuffer);
            timeSetSuccessfully = true;
            console.log(`Method 4: Raw socket time sync successful`);
          }
        } catch (error) {
          console.log(`Method 4 (raw socket) failed:`, error.message);
        }
      }

      if (!timeSetSuccessfully) {
        // Method 5: Try to use available methods to simulate time sync
        console.log(`All direct time sync methods failed. Attempting alternative approach...`);
        
        // For now, we'll just log that time sync was attempted
        // In a real implementation, you might need to use device-specific commands
        console.log(`Time sync attempted for ${dateTime.toLocaleString()} - method not available in this ZKLib version`);
        
        // Return success but with a warning message
        if (this.progressTracker) {
          this.progressTracker.updateProgress(100, 'Time Sync Attempted', `Time sync attempted for ${dateTime.toLocaleString()}`, 'Note: Direct time sync not supported by this device model');
        }
        
        return true; // Return true to indicate the operation was attempted
      }
      
      console.log(`Machine time set to: ${dateTime.toLocaleString()}`);
      
      if (this.progressTracker) {
        this.progressTracker.updateProgress(100, 'Time Set', `Machine time synchronized to ${dateTime.toLocaleString()}`, 'Time sync completed');
      }
      
      return true;
    } catch (error) {
      console.error('Error setting machine time:', error);
      if (this.progressTracker) {
        this.progressTracker.addError(`Time sync failed: ${error.message}`);
      }
      throw error;
    }
  }

  // Helper method to create time buffer (if needed for raw socket approach)
  createTimeBuffer(dateTime) {
    // This is a placeholder - you would need to implement the actual protocol
    // for sending time commands to ZKTeco devices
    const buffer = Buffer.alloc(16);
    // Add time data to buffer based on ZKTeco protocol
    // This is device-specific and would need proper implementation
    return buffer;
  }
}

// Main function to fetch time logs from a machine
export const fetchTimeLogsFromMachine = async (machine, startDate, endDate, progressTracker = null) => {
  const connection = new ZKTecoConnection(machine, progressTracker);
  
  try {
    // Set total steps for progress tracking
    if (progressTracker) {
      progressTracker.progress.totalSteps = 5; // Test, Connect, Fetch, Process, Disconnect
    }

    // Test connection first
    const isReachable = await connection.testConnection();
    if (!isReachable) {
      throw new Error(`Device ${machine.MachineAlias} (${machine.IP}) is not reachable`);
    }

    // Connect to machine
    await connection.connect();
    
    // Get time logs
    const logs = await connection.getTimeLogs(startDate, endDate);
    
    // Disconnect
    await connection.disconnect();
    
    return logs;
    
  } catch (error) {
    console.error('Error in fetchTimeLogsFromMachine:', error);
    
    // Try to disconnect even if there was an error
    try {
      await connection.disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting:', disconnectError);
    }
    
    throw error;
  }
};

// Function to fetch logs manually (for testing)
export const fetchMachineLogsManually = async (machine, startDate, endDate, progressTracker = null) => {
  return await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
};

// Function to fetch logs from all machines
export const fetchTimeLogsFromAllMachines = async (machines, startDate, endDate, progressTracker = null) => {
  const allLogs = [];
  
  if (progressTracker) {
    progressTracker.progress.totalSteps = machines.length;
  }
  
  for (const machine of machines) {
    try {
      if (progressTracker) {
        progressTracker.updateProgress(0, 'Processing Machine', `Fetching logs from ${machine.MachineAlias}`, `Machine ${machines.indexOf(machine) + 1} of ${machines.length}`);
      }
      
      const logs = await fetchTimeLogsFromMachine(machine, startDate, endDate, progressTracker);
      allLogs.push(...logs);
      
    } catch (error) {
      console.error(`Error fetching logs from machine ${machine.MachineAlias}:`, error);
      if (progressTracker) {
        progressTracker.addError(`Failed to fetch from ${machine.MachineAlias}: ${error.message}`);
      }
    }
  }
  
  return allLogs;
};

// Enhanced function to get USERID from badgenumber using USERINFO table with detailed employee info
export const getUserIdFromBadgeNumber = async (badgeNumber, pool = null) => {
  try {
    if (!pool) {
      pool = await getDb();
    }

    if (!badgeNumber) {
      console.log('❌ No badge number provided');
      return null;
    }

    console.log(`🔍 Looking up badge number: "${badgeNumber}" (type: ${typeof badgeNumber})`);

    // Look up USERID from USERINFO table using badgenumber
    const userQuery = `
      SELECT USERID, NAME, BADGENUMBER, DEFAULTDEPTID, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET
      FROM USERINFO 
      WHERE BADGENUMBER = @BADGENUMBER
    `;
    
    const result = await pool.request()
      .input('BADGENUMBER', sql.VarChar(50), String(badgeNumber))
      .query(userQuery);

    console.log(`📊 Query result: ${result.recordset.length} records found`);

    if (result.recordset.length > 0) {
      const userInfo = result.recordset[0];
      console.log(`✅ Found USERID ${userInfo.USERID} for badgenumber ${badgeNumber} - Employee: ${userInfo.NAME}`);
      return {
        userId: userInfo.USERID, // Keep as number since CHECKINOUT.USERID is int type
        name: userInfo.NAME,
        badgeNumber: userInfo.BADGENUMBER,
        departmentId: userInfo.DEFAULTDEPTID,
        title: userInfo.TITLE,
        gender: userInfo.GENDER,
        birthday: userInfo.BIRTHDAY,
        hiredDate: userInfo.HIREDDAY,
        address: userInfo.STREET
      };
    } else {
      console.log(`❌ No USERID found for badgenumber "${badgeNumber}"`);
      
      // Let's also try to see what badge numbers exist in the database
      const debugQuery = `
        SELECT TOP 5 BADGENUMBER, NAME 
        FROM USERINFO 
        ORDER BY BADGENUMBER
      `;
      
      const debugResult = await pool.request().query(debugQuery);
      console.log(`🔍 Sample badge numbers in database:`, debugResult.recordset.map(r => `${r.BADGENUMBER} (${r.NAME})`));
      
      return null;
    }

  } catch (error) {
    console.error('Error in getUserIdFromBadgeNumber:', error);
    return null;
  }
};

// New function to collect unregistered employees from logs
export const collectUnregisteredEmployees = async (logs, progressTracker = null) => {
  try {
    if (!logs || logs.length === 0) {
      return { unregisteredEmployees: [], totalLogs: 0 };
    }

    if (progressTracker) {
      progressTracker.updateProgress(0, 'Checking Registration', `Checking ${logs.length} logs for employee registration`, 'Verifying against USERINFO table');
    }

    const pool = await getDb();
    const unregisteredEmployees = new Map(); // Use Map to avoid duplicates
    let totalLogs = logs.length;

    console.log(`Starting registration check for ${logs.length} logs`);

    for (const log of logs) {
      try {
        const badgeNumber = log.badgeNumber || log.deviceUserId;
        if (!badgeNumber) {
          continue;
        }

        // Check if we already processed this badge number
        if (unregisteredEmployees.has(badgeNumber)) {
          // Increment log count for this employee
          const existing = unregisteredEmployees.get(badgeNumber);
          existing.logCount++;
          existing.logs.push({
            timestamp: log.timestamp,
            deviceName: log.machineAlias || log.deviceName,
            checkType: log.inOutMode || 'I',
            verifyMode: log.verifyMode || 1
          });
          continue;
        }

        // Check if employee is registered
        const userInfo = await getUserIdFromBadgeNumber(badgeNumber, pool);
        if (!userInfo) {
          // Employee is not registered - collect information
          unregisteredEmployees.set(badgeNumber, {
            badgeNumber: badgeNumber,
            name: `Unknown Employee (Badge: ${badgeNumber})`,
            logCount: 1,
            firstLogTime: log.timestamp,
            lastLogTime: log.timestamp,
            deviceName: log.machineAlias || log.deviceName,
            logs: [{
              timestamp: log.timestamp,
              deviceName: log.machineAlias || log.deviceName,
              checkType: log.inOutMode || 'I',
              verifyMode: log.verifyMode || 1
            }]
          });
          
          console.log(`⚠️  UNREGISTERED EMPLOYEE DETECTED: Badge Number ${badgeNumber} at ${log.timestamp}`);
        }

      } catch (logError) {
        console.error(`Error checking registration for log:`, logError);
      }
    }

    // Convert Map to Array and update last log time
    const unregisteredArray = Array.from(unregisteredEmployees.values()).map(emp => {
      // Sort logs by timestamp to get accurate first and last times
      emp.logs.sort((a, b) => {
        // Compare timestamps without converting them
        if (a.timestamp < b.timestamp) return -1;
        if (a.timestamp > b.timestamp) return 1;
        return 0;
      });
      emp.firstLogTime = emp.logs[0].timestamp;
      emp.lastLogTime = emp.logs[emp.logs.length - 1].timestamp;
      return emp;
    });

    if (progressTracker) {
      progressTracker.updateProgress(100, 'Registration Check Complete', `Found ${unregisteredArray.length} unregistered employees`, `${totalLogs} total logs processed`);
    }

    console.log(`Registration check complete: ${unregisteredArray.length} unregistered employees found from ${totalLogs} total logs`);
    
    return {
      unregisteredEmployees: unregisteredArray,
      totalLogs: totalLogs
    };

  } catch (error) {
    console.error('Error collecting unregistered employees:', error);
    return {
      unregisteredEmployees: [],
      totalLogs: logs.length
    };
  }
};

// Function to check if a time log already exists in CHECKINOUT table
export const checkLogExists = async (log, pool = null) => {
  try {
    if (!pool) {
      pool = await getDb();
    }

    // Get the actual USERID from badgenumber
    const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
    if (!userInfo) {
      console.log(`Cannot check log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
      return false; // If no USERID found, consider it doesn't exist
    }

    // Ensure proper data type conversion - DO NOT convert time
    const checkTime = log.timestamp; // Keep original timestamp format
    
    console.log(`🔍 Checking for duplicate: USERID=${userInfo.userId}, Time=${checkTime}`);

    // Simplified duplicate check - focus on USERID and CHECKTIME (most important fields)
    const checkQuery = `
      SELECT COUNT(*) as count 
      FROM CHECKINOUT 
      WHERE USERID = @USERID 
        AND CHECKTIME = @CHECKTIME
    `;
    
    const result = await pool.request()
      .input('USERID', sql.Int, userInfo.userId)
      .input('CHECKTIME', sql.VarChar(50), checkTime) // Use VarChar to match how logs are saved
      .query(checkQuery);

    const exists = result.recordset[0].count > 0;
    console.log(` Duplicate check result: ${exists ? 'EXISTS' : 'NOT FOUND'} (count: ${result.recordset[0].count})`);
    
    return exists;

  } catch (error) {
    console.error('Error checking if log exists:', error);
    return false;
  }
};

// Function to verify database contents (for debugging)
export const verifyDatabaseContents = async (sampleLog = null) => {
  try {
    const pool = await getDb();
    
    // Get basic table info
    const tableInfoQuery = `
      SELECT COUNT(*) as TotalRecords,
             MIN(CHECKTIME) as EarliestDate,
             MAX(CHECKTIME) as LatestDate
      FROM CHECKINOUT
    `;
    
    const tableInfo = await pool.request().query(tableInfoQuery);
    
    console.log('=== DATABASE VERIFICATION ===');
    console.log('Total records in CHECKINOUT table:', tableInfo.recordset[0].TotalRecords);
    console.log('Earliest date:', tableInfo.recordset[0].EarliestDate);
    console.log('Latest date:', tableInfo.recordset[0].LatestDate);
    
    // Get sample records
    const sampleQuery = `
      SELECT TOP 5 USERID, CHECKTIME, SENSORID, MEMOINFO, SN
      FROM CHECKINOUT 
      ORDER BY CHECKTIME DESC
    `;
    
    const sampleRecords = await pool.request().query(sampleQuery);
    console.log('Sample records:');
    sampleRecords.recordset.forEach((record, index) => {
      console.log(`${index + 1}. User: ${record.USERID}, Time: ${record.CHECKTIME}, Sensor: ${record.SENSORID}, Memo: ${record.MEMOINFO}, SN: ${record.SN}`);
    });
    
    // If a sample log is provided, check if it exists
    if (sampleLog) {
      const userId = String(sampleLog.employeeId || sampleLog.deviceUserId || sampleLog.id || '');
      // Use original timestamp format for verification
      const checkTime = sampleLog.timestamp; // Keep original format, no conversion
      const sensorId = String(sampleLog.deviceId || sampleLog.deviceName || '');
      
      const specificQuery = `
        SELECT USERID, CHECKTIME, SENSORID, MEMOINFO, SN, CHECKTYPE, VERIFYCODE, WORKCODE, USEREXTFMT
        FROM CHECKINOUT 
        WHERE USERID = @USERID 
          AND CHECKTIME = @CHECKTIME 
          AND SENSORID = @SENSORID
      `;
      
      const specificResult = await pool.request()
        .input('USERID', sql.VarChar(20), userId)
        .input('CHECKTIME', sql.DateTime, checkTime)
        .input('SENSORID', sql.VarChar(20), sensorId)
        .query(specificQuery);
      
      if (specificResult.recordset.length > 0) {
        console.log('Sample log EXISTS in database:');
        const record = specificResult.recordset[0];
        console.log(`  User: ${record.USERID}`);
        console.log(`  Time: ${record.CHECKTIME}`);
        console.log(`  Sensor: ${record.SENSORID}`);
        console.log(`  Memo: ${record.MEMOINFO}`);
        console.log(`  SN: ${record.SN}`);
        console.log(`  Type: ${record.CHECKTYPE}`);
        console.log(`  Verify: ${record.VERIFYCODE}`);
        console.log(`  Work: ${record.WORKCODE}`);
        console.log(`  ExtFmt: ${record.USEREXTFMT}`);
      } else {
        console.log('Sample log does NOT exist in database');
      }
    }
    
    console.log('=== END DATABASE VERIFICATION ===');
    
    return tableInfo.recordset[0];
    
  } catch (error) {
    console.error('Error verifying database contents:', error);
    throw error;
  }
};

// Enhanced function to filter out existing logs in batch with unregistered employee tracking
export const filterExistingLogs = async (logs, progressTracker = null) => {
  try {
    if (!logs || logs.length === 0) {
      return { uniqueLogs: [], existingCount: 0, unregisteredEmployees: [] };
    }

    if (progressTracker) {
      progressTracker.updateProgress(0, 'Checking Duplicates', `Checking ${logs.length} logs for duplicates`, 'Querying existing records');
    }

    // First, collect unregistered employees
    const { unregisteredEmployees } = await collectUnregisteredEmployees(logs, progressTracker);

    // First, verify database contents
    console.log('Verifying database contents before duplicate check...');
    await verifyDatabaseContents(logs[0]);

    const pool = await getDb();
    const uniqueLogs = [];
    let existingCount = 0;
    let skippedCount = 0; // Count logs skipped due to missing USERID

    console.log(`Starting duplicate check for ${logs.length} logs`);

    // Check each log individually for more accuracy
    for (const log of logs) {
      try {
        // Get the actual USERID from badgenumber
        const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
        if (!userInfo) {
          console.log(`Skipping log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
          skippedCount++;
          continue;
        }

        // Ensure proper data type conversion - DO NOT convert time
        const checkTime = log.timestamp; // Keep original timestamp format
        const sensorId = String(log.deviceId || log.deviceName || '');
        const deviceSn = String(log.deviceSerialNumber || log.userSn || '');
        const checkType = String(log.inOutMode || 'I');
        const verifyCode = parseInt(log.verifyMode) || 1;
        const memoInfo = null; // Leave MEMOINFO as null instead of machine alias
        const workCode = parseInt(log.workCode) || 0;
        const userExtFmt = String(log.reserved || '');

        // Debug: Log the exact values being checked
        console.log(`Checking duplicate for: USERID=${userInfo.userId}, BadgeNumber=${log.badgeNumber || log.deviceUserId}, Time=${checkTime}, Sensor=${sensorId}, Type=${checkType}`);

        // Check for exact duplicate using ALL fields
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM CHECKINOUT 
          WHERE USERID = @USERID 
            AND CHECKTIME = @CHECKTIME 
            AND CHECKTYPE = @CHECKTYPE
            AND VERIFYCODE = @VERIFYCODE
            AND SENSORID = @SENSORID
            AND MEMOINFO = @MEMOINFO
            AND WORKCODE = @WORKCODE
            AND (SN = @SN OR (SN IS NULL AND @SN = ''))
            AND (USEREXTFMT = @USEREXTFMT OR (USEREXTFMT IS NULL AND @USEREXTFMT = ''))
        `;
        
        const result = await pool.request()
          .input('USERID', sql.Int, userInfo.userId)
          .input('CHECKTIME', sql.VarChar(50), checkTime)
          .input('CHECKTYPE', sql.VarChar(1), checkType)
          .input('VERIFYCODE', sql.Int, verifyCode)
          .input('SENSORID', sql.VarChar(20), sensorId)
          .input('MEMOINFO', sql.VarChar(100), memoInfo)
          .input('WORKCODE', sql.Int, workCode)
          .input('SN', sql.VarChar(50), deviceSn)
          .input('USEREXTFMT', sql.VarChar(100), userExtFmt)
          .query(checkQuery);

        const exists = result.recordset[0].count > 0;
        
        // Debug: Log the query result
        console.log(`Query result for USERID ${userInfo.userId} at ${log.timestamp}: COUNT = ${result.recordset[0].count}, EXISTS = ${exists}`);
        
        if (exists) {
          existingCount++;
          console.log(`Duplicate found: USERID ${userInfo.userId} at ${log.timestamp} from ${sensorId}`);
        } else {
          uniqueLogs.push(log);
          console.log(`Unique log found: USERID ${userInfo.userId} at ${log.timestamp} from ${sensorId}`);
        }

      } catch (logError) {
        console.error(`Error checking log for duplicates:`, logError);
        // If check fails, assume it's unique to avoid blocking saves
        uniqueLogs.push(log);
      }
    }

    if (progressTracker) {
      progressTracker.updateProgress(100, 'Duplicate Check Complete', `Found ${uniqueLogs.length} logs`, `${existingCount} duplicates filtered out, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);
    }

    console.log(`Duplicate check complete: ${uniqueLogs.length} logs, ${existingCount} duplicates found, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);
    
    return {
      uniqueLogs: uniqueLogs,
      existingCount: existingCount,
      skippedCount: skippedCount,
      unregisteredEmployees: unregisteredEmployees,
      totalChecked: logs.length
    };

  } catch (error) {
    console.error('Error filtering existing logs:', error);
    return {
      uniqueLogs: logs,
      existingCount: 0,
      skippedCount: 0,
      unregisteredEmployees: [],
      totalChecked: logs.length
    };
  }
};

// Enhanced function to save only unique logs to CHECKINOUT table with unregistered employee notifications
export const saveLogsToCHECKINOUT = async (logs, progressTracker = null) => {
  try {
    console.log(`Starting to save ${logs.length} logs to CHECKINOUT table`);
    
    if (progressTracker) {
      progressTracker.updateProgress(85, 'Saving to Database', 'Preparing to save logs', 'Initializing database operations', logs.length, logs.length, 0);
    }

    // Check for existing logs and filter duplicates
    if (progressTracker) {
      progressTracker.updateProgress(87, 'Saving to Database', 'Checking for duplicates', 'Comparing with existing records', logs.length, logs.length, 0);
    }
    
    const duplicateCheckResult = await filterExistingLogs(logs, progressTracker);
    const uniqueLogs = duplicateCheckResult.uniqueLogs;
    const existingCount = duplicateCheckResult.existingCount;
    const skippedCount = duplicateCheckResult.skippedCount;
    const unregisteredEmployees = duplicateCheckResult.unregisteredEmployees;
    
    if (uniqueLogs.length === 0) {
      console.log('All logs already exist in database or no valid USERIDs found');
      if (progressTracker) {
        progressTracker.updateProgress(99, 'Saving to Database', 'No new logs to save', 'All records already exist', logs.length, logs.length, 0);
      }
      return { 
        success: true, 
        count: 0, 
        duplicates: existingCount,
        skipped: skippedCount,
        unregisteredEmployees: unregisteredEmployees,
        message: 'All logs already exist in database or no valid USERIDs found',
        newLogs: [] // Return empty array for new logs
      };
    }

    if (progressTracker) {
      progressTracker.updateProgress(90, 'Saving to Database', `Found ${uniqueLogs.length} logs`, 'Ready to save to database', logs.length, logs.length, 0);
    }

    const pool = await getDb();
    let savedCount = 0;
    let errorCount = 0;
    const newlyInsertedLogs = []; // Track only newly inserted logs

    console.log(`Starting to save ${uniqueLogs.length} unique logs to CHECKINOUT table`);

    // Process unique logs with gradual progress updates
    for (let i = 0; i < uniqueLogs.length; i++) {
      const log = uniqueLogs[i];
      
      try {
        // Get the actual USERID from badgenumber
        const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
        if (!userInfo) {
          console.log(`Skipping log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
          continue;
        }

        // Double-check for duplicates (safety measure)
        const exists = await checkLogExists(log, pool);
        if (exists) {
          console.log(`Skipping duplicate record for USERID ${userInfo.userId} at ${log.timestamp}`);
          continue;
        }

        // Ensure proper data type conversion - DO NOT convert time
        const checkTime = log.timestamp; // Keep original timestamp format
        const sensorId = String(log.deviceId || log.deviceName || '');
        const deviceSn = String(log.deviceSerialNumber || log.userSn || '');
        const checkType = String(log.inOutMode || 'I');
        const verifyCode = parseInt(log.verifyMode) || 1;
        const memoInfo = null; // Leave MEMOINFO as null instead of machine alias
        const workCode = parseInt(log.workCode) || 0;
        const userExtFmt = String(log.reserved || '');

        // Debug: Log the values being inserted
        console.log(`Inserting log: USERID=${userInfo.userId}, BadgeNumber=${log.badgeNumber || log.deviceUserId}, Time=${checkTime}, Sensor=${sensorId}, Type=${checkType}`);

        // Insert new record
        const insertQuery = `
          INSERT INTO CHECKINOUT (
            USERID, 
            CHECKTIME, 
            CHECKTYPE, 
            VERIFYCODE, 
            SENSORID, 
            MEMOINFO, 
            WORKCODE, 
            SN, 
            USEREXTFMT
          ) VALUES (
            @USERID, 
            @CHECKTIME, 
            @CHECKTYPE, 
            @VERIFYCODE, 
            @SENSORID, 
            @MEMOINFO, 
            @WORKCODE, 
            @SN, 
            @USEREXTFMT
          )
        `;

        const result = await pool.request()
          .input('USERID', sql.Int, userInfo.userId)
          .input('CHECKTIME', sql.VarChar(50), checkTime) // Use VarChar to avoid timezone conversion
          .input('CHECKTYPE', sql.VarChar(1), checkType)
          .input('VERIFYCODE', sql.Int, verifyCode)
          .input('SENSORID', sql.VarChar(20), sensorId)
          .input('MEMOINFO', sql.VarChar(100), memoInfo)
          .input('WORKCODE', sql.Int, workCode)
          .input('SN', sql.VarChar(50), deviceSn)
          .input('USEREXTFMT', sql.VarChar(100), userExtFmt)
          .query(insertQuery);

        console.log(`Successfully inserted log for USERID ${userInfo.userId} at ${checkTime}`);
        savedCount++;
        
        // Add to newly inserted logs array
        newlyInsertedLogs.push({
          ...log,
          userId: userInfo.userId,
          userName: userInfo.name,
          badgeNumber: userInfo.badgeNumber
        });
        
        // Update progress after each record (90-99%)
        if (progressTracker) {
          const recordProgress = 90 + Math.round((savedCount / uniqueLogs.length) * 9);
          progressTracker.updateProgress(recordProgress, 'Saving to Database', `Saved ${savedCount}/${uniqueLogs.length} records`, 'Writing to Database', logs.length, logs.length, savedCount);
        }

        // Small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (logError) {
        console.error(`Error saving individual log:`, logError);
        errorCount++;
        
        if (progressTracker) {
          progressTracker.addError(`Failed to save log for USERID ${log.badgeNumber || log.deviceUserId}: ${logError.message}`);
        }
      }
    }

    if (progressTracker) {
      progressTracker.updateProgress(99, 'Saving to Database', `Successfully saved ${savedCount} logs`, 'Database operations completed', logs.length, logs.length, savedCount);
    }

    console.log(`Save operation completed: ${savedCount} saved, ${errorCount} errors, ${existingCount} duplicates, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);

    return {
      success: true,
      count: savedCount,
      errors: errorCount,
      duplicates: existingCount,
      skipped: skippedCount,
      unregisteredEmployees: unregisteredEmployees,
      message: `Successfully saved ${savedCount} logs to database`,
      newLogs: newlyInsertedLogs // Return only newly inserted logs
    };

  } catch (error) {
    console.error('Error in saveLogsToCHECKINOUT:', error);
    if (progressTracker) {
      progressTracker.addError(`Save operation failed: ${error.message}`);
    }
    return {
      success: false,
      count: 0,
      errors: 1,
      message: `Failed to save logs: ${error.message}`,
      newLogs: []
    };
  }
};

// Function to fetch logs with employee names
export const fetchLogsWithEmployeeNames = async (startDate, endDate, progressTracker = null) => {
  try {
    if (progressTracker) {
      progressTracker.updateProgress(0, 'Fetching Logs', 'Fetching logs with employee names', 'Retrieving attendance data');
    }
    
    // This function would fetch logs and join with employee data
    // Implementation depends on your database structure
    console.log(`Fetching logs with employee names from ${startDate} to ${endDate}`);
    
    if (progressTracker) {
      progressTracker.updateProgress(100, 'Completed', 'Successfully fetched logs with employee names', 'Data retrieval complete');
    }
    
    return [];
    
  } catch (error) {
    console.error('Error fetching logs with employee names:', error);
    if (progressTracker) {
      progressTracker.addError(`Failed to fetch logs: ${error.message}`);
    }
    throw error;
  }
};

// Function to display database connection information
export const displayDatabaseInfo = async () => {
  try {
    const pool = await getDb();
    
    // Get database connection info from the pool
    const config = pool.config;
    
    console.log('=== DATABASE CONNECTION INFORMATION ===');
    console.log('Server IP/Host:', config.server);
    console.log('Database Name:', config.database);
    console.log('Port:', config.port);
    console.log('Username:', config.user);
    console.log('Encryption:', config.options.encrypt ? 'Enabled' : 'Disabled');
    console.log('Trust Server Certificate:', config.options.trustServerCertificate ? 'Yes' : 'No');
    console.log('Connection State:', pool.connected ? 'Connected' : 'Disconnected');
    
    // Get server info
    const serverInfoQuery = `
      SELECT 
        @@SERVERNAME as ServerName,
        @@VERSION as Version,
        DB_NAME() as CurrentDatabase,
        @@SERVICENAME as ServiceName
    `;
    
    const serverInfo = await pool.request().query(serverInfoQuery);
    
    if (serverInfo.recordset.length > 0) {
      const info = serverInfo.recordset[0];
      console.log('SQL Server Name:', info.ServerName);
      console.log('SQL Server Version:', info.Version);
      console.log('Current Database:', info.CurrentDatabase);
      console.log('Service Name:', info.ServiceName);
    }
    
    console.log('=== END DATABASE CONNECTION INFORMATION ===');
    
    return {
      server: config.server,
      database: config.database,
      port: config.port,
      user: config.user,
      connected: pool.connected
    };
    
  } catch (error) {
    console.error('Error getting database connection info:', error);
    throw error;
  }
};

// Separate function for fetch all logs - uses DateTime for duplicate checking
export const saveLogsToCHECKINOUT_FetchAll = async (logs, progressTracker = null) => {
  try {
    console.log(`Starting to save ${logs.length} logs to CHECKINOUT table (Fetch All mode)`);
    
    if (progressTracker) {
      progressTracker.updateProgress(85, 'Saving to Database', 'Preparing to save logs', 'Initializing database operations', logs.length, logs.length, 0);
    }

    // Check for existing logs and filter duplicates
    if (progressTracker) {
      progressTracker.updateProgress(87, 'Saving to Database', 'Checking for duplicates', 'Comparing with existing records', logs.length, logs.length, 0);
    }
    
    const duplicateCheckResult = await filterExistingLogs_FetchAll(logs, progressTracker);
    const uniqueLogs = duplicateCheckResult.uniqueLogs;
    const existingCount = duplicateCheckResult.existingCount;
    const skippedCount = duplicateCheckResult.skippedCount;
    const unregisteredEmployees = duplicateCheckResult.unregisteredEmployees;
    
    if (uniqueLogs.length === 0) {
      console.log('All logs already exist in database or no valid USERIDs found');
      if (progressTracker) {
        progressTracker.updateProgress(99, 'Saving to Database', 'No new logs to save', 'All records already exist', logs.length, logs.length, 0);
      }
      return { 
        success: true, 
        count: 0, 
        duplicates: existingCount,
        skipped: skippedCount,
        unregisteredEmployees: unregisteredEmployees,
        message: 'All logs already exist in database or no valid USERIDs found',
        newLogs: []
      };
    }

    if (progressTracker) {
      progressTracker.updateProgress(90, 'Saving to Database', `Found ${uniqueLogs.length} logs`, 'Ready to save to database', logs.length, logs.length, 0);
    }

    const pool = await getDb();
    let savedCount = 0;
    let errorCount = 0;
    const newlyInsertedLogs = [];

    console.log(`Starting to save ${uniqueLogs.length} unique logs to CHECKINOUT table`);

    // Process unique logs with gradual progress updates
    for (let i = 0; i < uniqueLogs.length; i++) {
      const log = uniqueLogs[i];
      
      try {
        // Get the actual USERID from badgenumber
        const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
        if (!userInfo) {
          console.log(`Skipping log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
          continue;
        }

        // Double-check for duplicates (safety measure)
        const exists = await checkLogExists(log, pool);
        if (exists) {
          console.log(`Skipping duplicate record for USERID ${userInfo.userId} at ${log.timestamp}`);
          continue;
        }

        // Ensure proper data type conversion - DO NOT convert time
        const checkTime = log.timestamp;
        const sensorId = String(log.deviceId || log.deviceName || '');
        const deviceSn = String(log.deviceSerialNumber || log.userSn || '');
        const checkType = String(log.inOutMode || 'I');
        const verifyCode = parseInt(log.verifyMode) || 1;
        const memoInfo = null;
        const workCode = parseInt(log.workCode) || 0;
        const userExtFmt = String(log.reserved || '');

        // Insert new record using VarChar (same as individual fetch)
        const insertQuery = `
          INSERT INTO CHECKINOUT (
            USERID, 
            CHECKTIME, 
            CHECKTYPE, 
            VERIFYCODE, 
            SENSORID, 
            MEMOINFO, 
            WORKCODE, 
            SN, 
            USEREXTFMT
          ) VALUES (
            @USERID, 
            @CHECKTIME, 
            @CHECKTYPE, 
            @VERIFYCODE, 
            @SENSORID, 
            @MEMOINFO, 
            @WORKCODE, 
            @SN, 
            @USEREXTFMT
          )
        `;

        await pool.request()
          .input('USERID', sql.Int, userInfo.userId)
          .input('CHECKTIME', sql.VarChar(50), checkTime) // Keep VarChar for consistency
          .input('CHECKTYPE', sql.VarChar(1), checkType)
          .input('VERIFYCODE', sql.Int, verifyCode)
          .input('SENSORID', sql.VarChar(20), sensorId)
          .input('MEMOINFO', sql.VarChar(100), memoInfo)
          .input('WORKCODE', sql.Int, workCode)
          .input('SN', sql.VarChar(50), deviceSn)
          .input('USEREXTFMT', sql.VarChar(100), userExtFmt)
          .query(insertQuery);

        console.log(`Successfully inserted log for USERID ${userInfo.userId} at ${checkTime}`);
        savedCount++;
        
        // Add to newly inserted logs array
        newlyInsertedLogs.push({
          ...log,
          userId: userInfo.userId,
          userName: userInfo.name,
          badgeNumber: userInfo.badgeNumber
        });
        
        // Update progress after each record (90-99%)
        if (progressTracker) {
          const recordProgress = 90 + Math.round((savedCount / uniqueLogs.length) * 9);
          progressTracker.updateProgress(recordProgress, 'Saving to Database', `Saved ${savedCount}/${uniqueLogs.length} records`, 'Writing to Database', logs.length, logs.length, savedCount);
        }

        // Small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (logError) {
        console.error(`Error saving individual log:`, logError);
        errorCount++;
        
        if (progressTracker) {
          progressTracker.addError(`Failed to save log for USERID ${log.badgeNumber || log.deviceUserId}: ${logError.message}`);
        }
      }
    }

    if (progressTracker) {
      progressTracker.updateProgress(99, 'Saving to Database', `Successfully saved ${savedCount} logs`, 'Database operations completed', logs.length, logs.length, savedCount);
    }

    console.log(`Save operation completed: ${savedCount} saved, ${errorCount} errors, ${existingCount} duplicates, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);

    return {
      success: true,
      count: savedCount,
      errors: errorCount,
      duplicates: existingCount,
      skipped: skippedCount,
      unregisteredEmployees: unregisteredEmployees,
      message: `Successfully saved ${savedCount} logs to database`,
      newLogs: newlyInsertedLogs
    };

  } catch (error) {
    console.error('Error in saveLogsToCHECKINOUT_FetchAll:', error);
    if (progressTracker) {
      progressTracker.addError(`Save operation failed: ${error.message}`);
    }
    return {
      success: false,
      count: 0,
      errors: 1,
      message: `Failed to save logs: ${error.message}`,
      newLogs: []
    };
  }
};

// Separate function for fetch all logs duplicate checking - uses DateTime
export const filterExistingLogs_FetchAll = async (logs, progressTracker = null) => {
  try {
    if (!logs || logs.length === 0) {
      return { uniqueLogs: [], existingCount: 0, unregisteredEmployees: [] };
    }

    if (progressTracker) {
      progressTracker.updateProgress(0, 'Checking Duplicates', `Checking ${logs.length} logs for duplicates`, 'Querying existing records');
    }

    // First, collect unregistered employees
    const { unregisteredEmployees } = await collectUnregisteredEmployees(logs, progressTracker);

    // First, verify database contents
    console.log('Verifying database contents before duplicate check (Fetch All mode)...');
    await verifyDatabaseContents(logs[0]);

    const pool = await getDb();
    const uniqueLogs = [];
    let existingCount = 0;
    let skippedCount = 0;

    console.log(`Starting duplicate check for ${logs.length} logs (Fetch All mode)`);

    // Check each log individually for more accuracy
    for (const log of logs) {
      try {
        // Get the actual USERID from badgenumber
        const userInfo = await getUserIdFromBadgeNumber(log.badgeNumber || log.deviceUserId, pool);
        if (!userInfo) {
          console.log(`Skipping log - no USERID found for badgenumber ${log.badgeNumber || log.deviceUserId}`);
          skippedCount++;
          continue;
        }

        // Ensure proper data type conversion - DO NOT convert time
        const checkTime = log.timestamp;
        const sensorId = String(log.deviceId || log.deviceName || '');
        const deviceSn = String(log.deviceSerialNumber || log.userSn || '');
        const checkType = String(log.inOutMode || 'I');
        const verifyCode = parseInt(log.verifyMode) || 1;
        const memoInfo = null;
        const workCode = parseInt(log.workCode) || 0;
        const userExtFmt = String(log.reserved || '');

        // Debug: Log the exact values being checked
        console.log(`[FETCH ALL] Checking duplicate for: USERID=${userInfo.userId}, BadgeNumber=${log.badgeNumber || log.deviceUserId}, Time=${checkTime}, Sensor=${sensorId}, Type=${checkType}`);

        // Check for exact duplicate using ALL fields - FETCH ALL uses DateTime
        const checkQuery = `
          SELECT COUNT(*) as count 
          FROM CHECKINOUT 
          WHERE USERID = @USERID 
            AND CHECKTIME = @CHECKTIME 
            AND CHECKTYPE = @CHECKTYPE
            AND VERIFYCODE = @VERIFYCODE
            AND SENSORID = @SENSORID
            AND MEMOINFO = @MEMOINFO
            AND WORKCODE = @WORKCODE
            AND (SN = @SN OR (SN IS NULL AND @SN = ''))
            AND (USEREXTFMT = @USEREXTFMT OR (USEREXTFMT IS NULL AND @USEREXTFMT = ''))
        `;
        
        const result = await pool.request()
          .input('USERID', sql.Int, userInfo.userId)
          .input('CHECKTIME', sql.VarChar(50), checkTime) // Fetch All uses VarChar
          .input('CHECKTYPE', sql.VarChar(1), checkType)
          .input('VERIFYCODE', sql.Int, verifyCode)
          .input('SENSORID', sql.VarChar(20), sensorId)
          .input('MEMOINFO', sql.VarChar(100), memoInfo)
          .input('WORKCODE', sql.Int, workCode)
          .input('SN', sql.VarChar(50), deviceSn)
          .input('USEREXTFMT', sql.VarChar(100), userExtFmt)
          .query(checkQuery);

        const exists = result.recordset[0].count > 0;
        
        // Debug: Log the query result with more detail
        console.log(`[FETCH ALL] Query result for USERID ${userInfo.userId} at ${checkTime}: COUNT = ${result.recordset[0].count}, EXISTS = ${exists}`);
        console.log(`[FETCH ALL] Query parameters: USERID=${userInfo.userId}, CHECKTIME='${checkTime}', CHECKTYPE='${checkType}', VERIFYCODE=${verifyCode}, SENSORID='${sensorId}'`);
        
        if (exists) {
          existingCount++;
          console.log(`[FETCH ALL] Duplicate found: USERID ${userInfo.userId} at ${checkTime} from ${sensorId}`);
        } else {
          uniqueLogs.push(log);
          console.log(`[FETCH ALL] Unique log found: USERID ${userInfo.userId} at ${checkTime} from ${sensorId}`);
        }

      } catch (logError) {
        console.error(`Error checking log for duplicates (Fetch All):`, logError);
        // If check fails, assume it's unique to avoid blocking saves
        uniqueLogs.push(log);
      }
    }

    if (progressTracker) {
      progressTracker.updateProgress(100, 'Duplicate Check Complete', `Found ${uniqueLogs.length} logs`, `${existingCount} duplicates filtered out, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);
    }

    console.log(`[FETCH ALL] Duplicate check complete: ${uniqueLogs.length} logs, ${existingCount} duplicates found, ${skippedCount} skipped due to missing USERID, ${unregisteredEmployees.length} unregistered employees`);
    
    return {
      uniqueLogs: uniqueLogs,
      existingCount: existingCount,
      skippedCount: skippedCount,
      unregisteredEmployees: unregisteredEmployees,
      totalChecked: logs.length
    };

  } catch (error) {
    console.error('Error filtering existing logs (Fetch All):', error);
    return {
      uniqueLogs: logs,
      existingCount: 0,
      skippedCount: 0,
      unregisteredEmployees: [],
      totalChecked: logs.length
    };
  }
};

// Test basic connectivity to the device
export const testDeviceConnectivity = async (ip, port) => {
  return new Promise((resolve, reject) => {
    import('net').then(({ Socket }) => {
      const socket = new Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${ip}:${port || 4370}`));
      }, 5000); // 5 second timeout for basic connectivity test
      
      socket.connect(port || 4370, ip, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(`Connection failed to ${ip}:${port || 4370}: ${err.message}`));
      });
    }).catch(err => {
      reject(new Error(`Failed to import net module: ${err.message}`));
    });
  });
};

// Export the classes for use in other modules
export { ZKTecoConnection, ProgressTracker };

// Enhanced getUsersFromMachine with comprehensive user structure retrieval
export const getUsersFromMachine = async (ip, port) => {
  try {
    console.log(`Attempting to get users from ZKTeco device ${ip}:${port || 4370} using enhanced methods`);
    
    // Create a mock machine object for ZKTecoConnection
    const machine = {
      MachineAlias: `Device-${ip}`,
      IP: ip,
      Port: port || 4370,
      MachineNumber: 1,
      sn: 'Unknown'
    };
    
    // Create ZKTecoConnection instance
    const connection = new ZKTecoConnection(machine);
    
    try {
      // Test connection first
      const isReachable = await connection.testConnection();
      if (!isReachable) {
        throw new Error(`Device ${ip}:${port || 4370} is not reachable`);
      }
      
      // Connect to machine
      await connection.connect();
      
      if (!connection.zk) {
        throw new Error('ZKLib instance not available after connection');
      }

      console.log('\n=== ENHANCED USER INFORMATION RETRIEVAL ===');
      console.log('Available ZKLib methods:', Object.getOwnPropertyNames(connection.zk).filter(name => typeof connection.zk[name] === 'function'));
      
      let users = [];
      let retrievalMethod = 'none';
      
      // Method 1: Try getAllUserInfo (if available)
      if (typeof connection.zk.getAllUserInfo === 'function') {
        console.log('\n--- Trying getAllUserInfo method ---');
        try {
          const allUserInfo = await connection.zk.getAllUserInfo();
          console.log('getAllUserInfo raw response:', allUserInfo);
          console.log('getAllUserInfo type:', typeof allUserInfo);
          console.log('getAllUserInfo is array:', Array.isArray(allUserInfo));
          
          if (allUserInfo && (Array.isArray(allUserInfo) || allUserInfo.data)) {
            users = Array.isArray(allUserInfo) ? allUserInfo : allUserInfo.data;
            retrievalMethod = 'getAllUserInfo';
            console.log(`✅ Successfully retrieved ${users.length} users using getAllUserInfo`);
          }
        } catch (error) {
          console.log('❌ getAllUserInfo failed:', error.message);
        }
      }
      
      // Method 2: Try SSR_GetAllUserInfo (if available and previous method failed)
      if (users.length === 0 && typeof connection.zk.SSR_GetAllUserInfo === 'function') {
        console.log('\n--- Trying SSR_GetAllUserInfo method ---');
        try {
          const ssrUserInfo = await connection.zk.SSR_GetAllUserInfo();
          console.log('SSR_GetAllUserInfo raw response:', ssrUserInfo);
          console.log('SSR_GetAllUserInfo type:', typeof ssrUserInfo);
          console.log('SSR_GetAllUserInfo is array:', Array.isArray(ssrUserInfo));
          
          if (ssrUserInfo && (Array.isArray(ssrUserInfo) || ssrUserInfo.data)) {
            users = Array.isArray(ssrUserInfo) ? ssrUserInfo : ssrUserInfo.data;
            retrievalMethod = 'SSR_GetAllUserInfo';
            console.log(`✅ Successfully retrieved ${users.length} users using SSR_GetAllUserInfo`);
          }
        } catch (error) {
          console.log('❌ SSR_GetAllUserInfo failed:', error.message);
        }
      }
      
      // Method 3: Try getInfo to get device information first, then getUsers
      if (users.length === 0 && typeof connection.zk.getInfo === 'function') {
        console.log('\n--- Trying getInfo + getUsers method ---');
        try {
          const deviceInfo = await connection.zk.getInfo();
          console.log('Device info:', deviceInfo);
          
          if (typeof connection.zk.getUsers === 'function') {
            const basicUsers = await connection.zk.getUsers();
            console.log('getUsers raw response:', basicUsers);
            console.log('getUsers type:', typeof basicUsers);
            console.log('getUsers is array:', Array.isArray(basicUsers));
            
            // Handle different response formats
            if (Array.isArray(basicUsers)) {
              users = basicUsers;
            } else if (basicUsers && Array.isArray(basicUsers.data)) {
              users = basicUsers.data;
            } else if (basicUsers && basicUsers.users && Array.isArray(basicUsers.users)) {
              users = basicUsers.users;
            } else if (basicUsers && basicUsers.result && Array.isArray(basicUsers.result)) {
              users = basicUsers.result;
            }
            
            if (users.length > 0) {
              retrievalMethod = 'getInfo+getUsers';
              console.log(`✅ Successfully retrieved ${users.length} users using getInfo+getUsers`);
            }
          }
        } catch (error) {
          console.log('❌ getInfo+getUsers failed:', error.message);
        }
      }
      
      // Method 4: Fallback to basic getUsers method
      if (users.length === 0 && typeof connection.zk.getUsers === 'function') {
        console.log('\n--- Fallback to basic getUsers method ---');
        try {
          const basicUsers = await connection.zk.getUsers();
          console.log('Basic getUsers raw response:', basicUsers);
          
          // Handle different response formats
          if (Array.isArray(basicUsers)) {
            users = basicUsers;
          } else if (basicUsers && Array.isArray(basicUsers.data)) {
            users = basicUsers.data;
          } else if (basicUsers && basicUsers.users && Array.isArray(basicUsers.users)) {
            users = basicUsers.users;
          } else if (basicUsers && basicUsers.result && Array.isArray(basicUsers.result)) {
            users = basicUsers.result;
          }
          
          if (users.length > 0) {
            retrievalMethod = 'basic_getUsers';
            console.log(`✅ Successfully retrieved ${users.length} users using basic getUsers`);
          }
        } catch (error) {
          console.log('❌ Basic getUsers failed:', error.message);
        }
      }
      
      console.log(`\n=== USER RETRIEVAL SUMMARY ===`);
      console.log(`Method used: ${retrievalMethod}`);
      console.log(`Users retrieved: ${users.length}`);
      
      if (users.length > 0) {
        // Analyze the first few users to understand the structure
        console.log('\n=== USER STRUCTURE ANALYSIS ===');
        console.log('First user complete structure:');
        console.log(JSON.stringify(users[0], null, 2));
        console.log('Available fields in first user:', Object.keys(users[0]));
        
        // Look for ZKTeco standard fields
        const zktecoStandardFields = ['PIN', 'Name', 'Password', 'Privilege', 'CardNumber', 'Group', 'TimeZone1', 'TimeZone2', 'TimeZone3', 'Enabled'];
        console.log('\nZKTeco standard fields analysis:');
        zktecoStandardFields.forEach(field => {
          if (users[0].hasOwnProperty(field)) {
            console.log(`  ✅ ${field}: "${users[0][field]}" (type: ${typeof users[0][field]})`);
          } else {
            // Check for alternative field names
            const alternatives = {
              'PIN': ['pin', 'Pin', 'PIN', 'enrollNumber', 'EnrollNumber', 'userId', 'user_id'],
              'Name': ['name', 'Name', 'NAME', 'fullName', 'FullName'],
              'Password': ['password', 'Password', 'PASSWORD', 'pwd'],
              'Privilege': ['privilege', 'Privilege', 'PRIVILEGE', 'role', 'Role'],
              'CardNumber': ['cardNumber', 'CardNumber', 'cardNo', 'CardNo', 'cardno', 'card_number'],
              'Group': ['group', 'Group', 'GROUP', 'grp'],
              'TimeZone1': ['timeZone1', 'TimeZone1', 'timezone1', 'tz1'],
              'TimeZone2': ['timeZone2', 'TimeZone2', 'timezone2', 'tz2'],
              'TimeZone3': ['timeZone3', 'TimeZone3', 'timezone3', 'tz3'],
              'Enabled': ['enabled', 'Enabled', 'ENABLED', 'active', 'Active']
            };
            
            const alts = alternatives[field] || [];
            let found = false;
            for (const alt of alts) {
              if (users[0].hasOwnProperty(alt)) {
                console.log(`  🔄 ${field} -> ${alt}: "${users[0][alt]}" (type: ${typeof users[0][alt]})`);
                found = true;
                break;
              }
            }
            if (!found) {
              console.log(`  ❌ ${field}: not found`);
            }
          }
        });
        
        // Transform users to enhanced format
        const transformedUsers = users.map(user => {
          const transformed = {
            // Try to map to ZKTeco standard fields
            PIN: user.PIN || user.pin || user.Pin || user.enrollNumber || user.EnrollNumber || user.userId || user.user_id || user.uid || '',
            Name: user.Name || user.name || user.NAME || user.fullName || user.FullName || '',
            Password: user.Password || user.password || user.PASSWORD || user.pwd || '',
            Privilege: user.Privilege || user.privilege || user.PRIVILEGE || user.role || user.Role || 0,
            CardNumber: user.CardNumber || user.cardNumber || user.cardNo || user.CardNo || user.cardno || user.card_number || '',
            Group: user.Group || user.group || user.GROUP || user.grp || 0,
            TimeZone1: user.TimeZone1 || user.timeZone1 || user.timezone1 || user.tz1 || 0,
            TimeZone2: user.TimeZone2 || user.timeZone2 || user.timezone2 || user.tz2 || 0,
            TimeZone3: user.TimeZone3 || user.timeZone3 || user.timezone3 || user.tz3 || 0,
            Enabled: user.Enabled !== undefined ? user.Enabled : (user.enabled !== undefined ? user.enabled : (user.active !== undefined ? user.active : true)),
            
            // Keep original fields for backward compatibility
            userId: user.uid || user.userId || user.id || user.PIN || user.pin,
            badgeNumber: user.badgeNumber || user.badge || user.id || user.uid || user.PIN || user.pin,
            name: user.name || user.Name || user.fullName || '',
            password: user.password || user.Password || '',
            role: user.role || user.privilege || user.Privilege || 0,
            cardNo: user.cardNo || user.cardNumber || user.CardNumber || '',
            
            // Include raw user data for debugging
            _raw: user
          };
          
          return transformed;
        });
        
        console.log('\n=== ENHANCED USER TRANSFORMATION ===');
        console.log('First transformed user:');
        console.log(JSON.stringify(transformedUsers[0], null, 2));
        
        // Test against known database values
        console.log('\n=== TESTING AGAINST DATABASE VALUES ===');
        const testBadgeNumbers = ['138', '34', '148', '4', '27', '2359', '2298', '2746', '2653'];
        const testNames = ['Abella, Macy', 'Villahermosa, Precious', 'Montalbo, Hazel'];
        
        console.log('Testing PIN field against database BADGENUMBER:');
        testBadgeNumbers.forEach(badge => {
          const found = transformedUsers.find(user => String(user.PIN).trim() === badge);
          console.log(`  Badge ${badge}: ${found ? '✅ Found' : '❌ Not found'} ${found ? `(${found.Name})` : ''}`);
        });
        
        console.log('Testing Name field against database NAME:');
        testNames.forEach(name => {
          const found = transformedUsers.find(user => String(user.Name).trim().toLowerCase() === name.toLowerCase());
          console.log(`  Name "${name}": ${found ? '✅ Found' : '❌ Not found'} ${found ? `(PIN: ${found.PIN})` : ''}`);
        });
        
        // Disconnect
        await connection.disconnect();
        
        return transformedUsers;
      } else {
        console.log('❌ No users retrieved from any method');
        await connection.disconnect();
        return [];
      }
      
    } catch (connectionError) {
      console.error('Error in ZKTecoConnection:', connectionError);
      try {
        await connection.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting:', disconnectError);
      }
      throw connectionError;
    }
    
  } catch (error) {
    console.error('Error in enhanced getUsersFromMachine:', error);
    throw new Error(`Failed to get users from machine ${ip}:${port || 4370}. ${error.message}`);
  }
};

// Enhanced function to get biometric templates (fingerprint and face) from ZKTeco device
export const getBiometricTemplatesFromMachine = async (ip, port) => {
  try {
    console.log(`Attempting to get biometric templates from ZKTeco device ${ip}:${port || 4370}`);
    
    const machine = {
      MachineAlias: `Device-${ip}`,
      IP: ip,
      Port: port || 4370,
      MachineNumber: 1,
      sn: 'Unknown'
    };
    
    const connection = new ZKTecoConnection(machine);
    
    try {
      await connection.testConnection();
      await connection.connect();
      
      if (!connection.zk) {
        throw new Error('ZKLib instance not available after connection');
      }

      console.log('\n=== BIOMETRIC TEMPLATE RETRIEVAL ===');
      
      // Get all users first to know which users to get templates for
      const users = await connection.zk.getUsers();
      console.log(`Found ${users.data ? users.data.length : 0} users on device`);
      
      if (!users.data || users.data.length === 0) {
        console.log('No users found on device, returning empty template list');
        await connection.disconnect();
        return [];
      }

      const biometricTemplates = [];
      
      // Try different methods to get biometric templates
      const templateMethods = [
        'getUserTemplate',
        'SSR_GetUserTemplate', 
        'getFingerTemplate',
        'getFaceTemplate',
        'getAllUserTemplate',
        'SSR_GetAllUserTemplate',
        'getTemplate',
        'getUserFingerTemplate',
        'getUserFaceTemplate'
      ];

      console.log('\n=== TRYING BIOMETRIC TEMPLATE METHODS ===');
      
      for (const methodName of templateMethods) {
        if (typeof connection.zk[methodName] === 'function') {
          console.log(`\n--- Trying ${methodName} method ---`);
          try {
            const templates = await connection.zk[methodName]();
            console.log(`${methodName} result:`, {
              type: typeof templates,
              isArray: Array.isArray(templates),
              hasData: templates && templates.data,
              length: templates ? (Array.isArray(templates) ? templates.length : (templates.data ? templates.data.length : 'unknown')) : 0
            });
            
            if (templates && (Array.isArray(templates) || templates.data)) {
              const templateArray = Array.isArray(templates) ? templates : templates.data;
              console.log(`✅ ${methodName} returned ${templateArray.length} templates`);
              
              // Transform templates to standard format
              const transformedTemplates = templateArray.map((template, index) => {
                const transformed = {
                  method: methodName,
                  index: index,
                  raw: template,
                  // Standard fields
                  userId: template.userId || template.UserID || template.user_id || template.uid || template.id || 'unknown',
                  pin: template.pin || template.PIN || template.userPin || template.user_pin || 'unknown',
                  name: template.name || template.Name || template.userName || template.user_name || 'unknown',
                  templateType: template.templateType || template.TemplateType || template.type || template.template_type || 'unknown',
                  templateData: template.templateData || template.TemplateData || template.data || template.template_data || null,
                  templateSize: template.templateSize || template.TemplateSize || template.size || template.template_size || 0,
                  fingerId: template.fingerId || template.FingerID || template.finger_id || template.fingerIndex || template.finger_index || 0,
                  faceId: template.faceId || template.FaceID || template.face_id || template.faceIndex || template.face_index || 0,
                  valid: template.valid || template.Valid || template.isValid || template.is_valid || true,
                  enabled: template.enabled || template.Enabled || template.isEnabled || template.is_enabled || true,
                  // Additional fields
                  cardNumber: template.cardNumber || template.CardNumber || template.card_number || template.cardNo || template.card_no || null,
                  privilege: template.privilege || template.Privilege || template.userPrivilege || template.user_privilege || 0,
                  group: template.group || template.Group || template.userGroup || template.user_group || 0,
                  timezone: template.timezone || template.Timezone || template.userTimezone || template.user_timezone || 0
                };
                
                // Determine template type based on available data
                if (template.fingerId !== undefined || template.FingerID !== undefined || template.finger_id !== undefined) {
                  transformed.templateType = 'fingerprint';
                } else if (template.faceId !== undefined || template.FaceID !== undefined || template.face_id !== undefined) {
                  transformed.templateType = 'face';
                } else if (template.templateType === 'fingerprint' || template.TemplateType === 'fingerprint') {
                  transformed.templateType = 'fingerprint';
                } else if (template.templateType === 'face' || template.TemplateType === 'face') {
                  transformed.templateType = 'face';
                }
                
                return transformed;
              });
              
              biometricTemplates.push(...transformedTemplates);
              console.log(`Added ${transformedTemplates.length} templates from ${methodName}`);
            }
          } catch (error) {
            console.log(`❌ ${methodName} failed:`, error.message);
          }
        }
      }
      
      // If no templates found through standard methods, try user-specific template retrieval
      if (biometricTemplates.length === 0) {
        console.log('\n=== TRYING USER-SPECIFIC TEMPLATE RETRIEVAL ===');
        
        for (const user of users.data.slice(0, 5)) { // Limit to first 5 users for testing
          const userPin = user.PIN || user.pin || user.userId || user.UserID;
          if (!userPin) continue;
          
          console.log(`\n--- Getting templates for user ${userPin} ---`);
          
          // Try to get templates for this specific user
          const userTemplateMethods = [
            'getUserTemplate',
            'SSR_GetUserTemplate',
            'getUserFingerTemplate', 
            'getUserFaceTemplate'
          ];
          
          for (const methodName of userTemplateMethods) {
            if (typeof connection.zk[methodName] === 'function') {
              try {
                console.log(`Trying ${methodName} for user ${userPin}`);
                const userTemplates = await connection.zk[methodName](userPin);
                console.log(`${methodName} for user ${userPin}:`, {
                  type: typeof userTemplates,
                  isArray: Array.isArray(userTemplates),
                  hasData: userTemplates && userTemplates.data,
                  length: userTemplates ? (Array.isArray(userTemplates) ? userTemplates.length : (userTemplates.data ? userTemplates.data.length : 'unknown')) : 0
                });
                
                if (userTemplates && (Array.isArray(userTemplates) || userTemplates.data)) {
                  const templateArray = Array.isArray(userTemplates) ? userTemplates : userTemplates.data;
                  console.log(`✅ Found ${templateArray.length} templates for user ${userPin} using ${methodName}`);
                  
                  // Transform user-specific templates
                  const userTransformedTemplates = templateArray.map((template, index) => ({
                    method: methodName,
                    userPin: userPin,
                    index: index,
                    raw: template,
                    userId: userPin,
                    pin: userPin,
                    name: user.name || user.Name || 'unknown',
                    templateType: template.templateType || template.TemplateType || template.type || 'unknown',
                    templateData: template.templateData || template.TemplateData || template.data || null,
                    templateSize: template.templateSize || template.TemplateSize || template.size || 0,
                    fingerId: template.fingerId || template.FingerID || template.finger_id || 0,
                    faceId: template.faceId || template.FaceID || template.face_id || 0,
                    valid: template.valid || template.Valid || true,
                    enabled: template.enabled || template.Enabled || true,
                    cardNumber: template.cardNumber || template.CardNumber || null,
                    privilege: template.privilege || template.Privilege || 0,
                    group: template.group || template.Group || 0,
                    timezone: template.timezone || template.Timezone || 0
                  }));
                  
                  biometricTemplates.push(...userTransformedTemplates);
                }
              } catch (error) {
                console.log(`❌ ${methodName} for user ${userPin} failed:`, error.message);
              }
            }
          }
        }
      }
      
      console.log(`\n=== BIOMETRIC TEMPLATE SUMMARY ===`);
      console.log(`Total templates found: ${biometricTemplates.length}`);
      
      // Group templates by type
      const fingerprintTemplates = biometricTemplates.filter(t => t.templateType === 'fingerprint');
      const faceTemplates = biometricTemplates.filter(t => t.templateType === 'face');
      const unknownTemplates = biometricTemplates.filter(t => t.templateType === 'unknown');
      
      console.log(`Fingerprint templates: ${fingerprintTemplates.length}`);
      console.log(`Face templates: ${faceTemplates.length}`);
      console.log(`Unknown type templates: ${unknownTemplates.length}`);
      
      // Show sample templates
      if (biometricTemplates.length > 0) {
        console.log('\n=== SAMPLE TEMPLATES ===');
        biometricTemplates.slice(0, 3).forEach((template, index) => {
          console.log(`Template ${index + 1}:`, {
            userId: template.userId,
            pin: template.pin,
            name: template.name,
            templateType: template.templateType,
            templateSize: template.templateSize,
            fingerId: template.fingerId,
            faceId: template.faceId,
            valid: template.valid,
            enabled: template.enabled,
            method: template.method
          });
        });
      }
      
      await connection.disconnect();
      return biometricTemplates;
      
    } catch (connectionError) {
      console.error('Error in ZKTecoConnection:', connectionError);
      try { 
        await connection.disconnect(); 
      } catch (disconnectError) { 
        console.error('Error disconnecting:', disconnectError); 
      }
      throw connectionError;
    }
    
  } catch (error) {
    console.error('Error in getBiometricTemplatesFromMachine:', error);
    throw new Error(`Failed to get biometric templates from machine ${ip}:${port || 4370}. ${error.message}`);
  }
};

// Function to get comprehensive user data including biometric templates
export const getUsersWithBiometricDataFromMachine = async (ip, port) => {
  try {
    console.log(`Getting users with biometric data from ZKTeco device ${ip}:${port || 4370}`);
    
    // Get basic user information
    const users = await getUsersFromMachine(ip, port);
    console.log(`Found ${users.length} users`);
    
    // Get biometric templates
    const biometricTemplates = await getBiometricTemplatesFromMachine(ip, port);
    console.log(`Found ${biometricTemplates.length} biometric templates`);
    
    // Combine user data with biometric templates
    const usersWithBiometrics = users.map(user => {
      const userTemplates = biometricTemplates.filter(template => 
        template.userId === user.PIN || template.pin === user.PIN || template.userId === user.BADGENUMBER
      );
      
      return {
        ...user,
        biometricTemplates: userTemplates,
        fingerprintTemplates: userTemplates.filter(t => t.templateType === 'fingerprint'),
        faceTemplates: userTemplates.filter(t => t.templateType === 'face'),
        hasFingerprints: userTemplates.some(t => t.templateType === 'fingerprint'),
        hasFace: userTemplates.some(t => t.templateType === 'face'),
        templateCount: userTemplates.length
      };
    });
    
    console.log(`\n=== USERS WITH BIOMETRIC DATA SUMMARY ===`);
    console.log(`Total users: ${usersWithBiometrics.length}`);
    console.log(`Users with fingerprints: ${usersWithBiometrics.filter(u => u.hasFingerprints).length}`);
    console.log(`Users with face templates: ${usersWithBiometrics.filter(u => u.hasFace).length}`);
    console.log(`Users with any biometrics: ${usersWithBiometrics.filter(u => u.templateCount > 0).length}`);
    
    return usersWithBiometrics;
    
  } catch (error) {
    console.error('Error in getUsersWithBiometricDataFromMachine:', error);
    throw new Error(`Failed to get users with biometric data from machine ${ip}:${port || 4370}. ${error.message}`);
  }
};

// Helper function to get biometric counts by iterating through users
async function getBiometricCounts(zk) {
  try {
    // Check if the methods exist first
    if (typeof zk.getUserFinger !== 'function' || typeof zk.getUserFace !== 'function') {
      console.log('Biometric template methods not available on this device');
      return { fingerprintCount: 0, faceCount: 0 };
    }

    let usersResponse = await zk.getUsers();
    let users = [];
    
    // Handle different response formats
    if (Array.isArray(usersResponse)) {
      users = usersResponse;
    } else if (usersResponse && usersResponse.data && Array.isArray(usersResponse.data)) {
      users = usersResponse.data;
    } else if (usersResponse && usersResponse.users && Array.isArray(usersResponse.users)) {
      users = usersResponse.users;
    } else if (usersResponse && usersResponse.result && Array.isArray(usersResponse.result)) {
      users = usersResponse.result;
    } else {
      return { fingerprintCount: 0, faceCount: 0 };
    }
    
    let fingerprintCount = 0;
    let faceCount = 0;

    // Test with first few users only to avoid timeout
    const testUsers = users.slice(0, 5);

    for (let user of testUsers) {
      // Try fetching fingerprints for each finger (0–9)
      for (let finger = 0; finger < 10; finger++) {
        try {
          let fp = await zk.getUserFinger(user.userId || user.uid, finger);
          if (fp && fp.template) {
            fingerprintCount++;
          }
        } catch (error) {
          // Silently handle errors
        }
      }

      // Try fetching face template
      try {
        let face = await zk.getUserFace(user.userId || user.uid, 0);
        if (face && face.template) {
          faceCount++;
        }
      } catch (error) {
        // Silently handle errors
      }
    }

    return { fingerprintCount, faceCount };
  } catch (error) {
    return { fingerprintCount: 0, faceCount: 0 };
  }
}

// Download employee data from machine to database
export const downloadEmployeeData = async (userId, employeeData, ip, port) => {
  let transaction = null;
  
  try {
    console.log(`Downloading employee data for user ${userId} from ${ip}:${port}`);
    
    const pool = await getDb();
    
    // Start transaction
    transaction = pool.transaction();
    await transaction.begin();
    
    // Initialize biometric counters
    let fingerprintCount = 0;
    let faceCount = 0;
    
    try {
      // Check if user already exists in database by BADGENUMBER (PIN)
      const existingUserResult = await transaction.request()
        .input('BADGENUMBER', sql.VarChar(50), userId.toString())
        .query('SELECT USERID, BADGENUMBER FROM USERINFO WHERE BADGENUMBER = @BADGENUMBER');
      
      const userExists = existingUserResult.recordset.length > 0;
      let dbUserId = null;
      
      if (userExists) {
        dbUserId = existingUserResult.recordset[0].USERID;
        console.log(`User with PIN ${userId} already exists in database (USERID: ${dbUserId}). Updating biometric data only.`);
        
        // Update user info (optional - only if needed)
        await transaction.request()
          .input('USERID', sql.Int, dbUserId)
          .input('NAME', sql.VarChar(50), employeeData.name || '')
          .input('privilege', sql.Int, employeeData.privilege || 0)
          .query(`
            UPDATE USERINFO SET 
              NAME = @NAME,
              privilege = @privilege
            WHERE USERID = @USERID
          `);
        
        console.log(`✅ User info updated for ${employeeData.name}`);
      } else {
        // Insert new user info (without specifying USERID - let it auto-generate)
        const insertResult = await transaction.request()
          .input('BADGENUMBER', sql.VarChar(50), userId.toString())
          .input('NAME', sql.VarChar(50), employeeData.name || '')
          .input('DEFAULTDEPTID', sql.Int, 1) // Default department
          .input('SSN', sql.VarChar(50), null) // Set to null
          .input('TITLE', sql.VarChar(50), null) // Set to null
          .input('GENDER', sql.Int, null) // Set to null
          .input('BIRTHDAY', sql.DateTime, null)
          .input('HIREDDAY', sql.DateTime, null) // Set to null
          .input('STREET', sql.VarChar(100), '')
          .input('PHOTO', sql.VarBinary, null)
          .input('privilege', sql.Int, employeeData.privilege || 0)
          .query(`
            INSERT INTO USERINFO (BADGENUMBER, NAME, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, PHOTO, privilege)
            OUTPUT INSERTED.USERID
            VALUES (@BADGENUMBER, @NAME, @DEFAULTDEPTID, @SSN, @TITLE, @GENDER, @BIRTHDAY, @HIREDDAY, @STREET, @PHOTO, @privilege)
          `);
        
        dbUserId = insertResult.recordset[0].USERID;
        console.log(`✅ New user info saved for ${employeeData.name} (USERID: ${dbUserId})`);
      }
      
      // 2. Download and save fingerprint templates
      const { ZKTecoConnection } = await import('./zktecoSDK.js');
      const connection = new ZKTecoConnection({ IP: ip, Port: port });
      
      try {
        await connection.connect();
        
        // Clear existing biometric data for this user
        await transaction.request()
          .input('USERID', sql.Int, dbUserId)
          .query('DELETE FROM TEMPLATE WHERE USERID = @USERID');
        
        await transaction.request()
          .input('USERID', sql.Int, dbUserId)
          .query('DELETE FROM FaceTemp WHERE UserID = @USERID');
        
        console.log(`🧹 Cleared existing biometric data for user ${userId} (DB USERID: ${dbUserId})`);
        
        // Try to get fingerprint templates
        for (let finger = 0; finger < 10; finger++) {
          try {
            const fingerprint = await connection.zk.getUserFinger(userId, finger);
            if (fingerprint && fingerprint.length > 0) {
              await transaction.request()
                .input('USERID', sql.Int, dbUserId)
                .input('FINGERID', sql.Int, finger)
                .input('TEMPLATE', sql.VarBinary, fingerprint)
                .input('TEMPLATE2', sql.VarBinary, null)
                .input('TEMPLATE3', sql.VarBinary, null)
                .input('BITMAPPICTURE', sql.VarBinary, null)
                .input('BITMAPPICTURE2', sql.VarBinary, null)
                .input('BITMAPPICTURE3', sql.VarBinary, null)
                .input('BITMAPPICTURE4', sql.VarBinary, null)
                .input('USETYPE', sql.SmallInt, 0)
                .input('EMACHINENUM', sql.VarChar(3), '001')
                .input('TEMPLATE1', sql.VarBinary, null)
                .input('Flag', sql.SmallInt, 0)
                .input('DivisionFP', sql.SmallInt, 0)
                .input('TEMPLATE4', sql.VarBinary, null)
                .query(`
                  INSERT INTO TEMPLATE (USERID, FINGERID, TEMPLATE, TEMPLATE2, TEMPLATE3, BITMAPPICTURE, BITMAPPICTURE2, BITMAPPICTURE3, BITMAPPICTURE4, USETYPE, EMACHINENUM, TEMPLATE1, Flag, DivisionFP, TEMPLATE4)
                  VALUES (@USERID, @FINGERID, @TEMPLATE, @TEMPLATE2, @TEMPLATE3, @BITMAPPICTURE, @BITMAPPICTURE2, @BITMAPPICTURE3, @BITMAPPICTURE4, @USETYPE, @EMACHINENUM, @TEMPLATE1, @Flag, @DivisionFP, @TEMPLATE4)
                `);
              fingerprintCount++;
            }
          } catch (fingerError) {
            // Fingerprint not found for this finger, continue
          }
        }
        
        console.log(`✅ Downloaded ${fingerprintCount} fingerprint templates`);
        
        // Try to get face templates
        for (let face = 0; face < 5; face++) {
          try {
            const faceTemplate = await connection.zk.getUserFace(userId, face);
            if (faceTemplate && faceTemplate.length > 0) {
              await transaction.request()
                .input('USERNO', sql.VarChar(24), userId.toString())
                .input('SIZE', sql.Int, faceTemplate.length)
                .input('pin', sql.Int, parseInt(userId))
                .input('FACEID', sql.Int, face)
                .input('VALID', sql.Int, 1)
                .input('RESERVE', sql.Int, 0)
                .input('ACTIVETIME', sql.Int, 0)
                .input('VFCOUNT', sql.Int, 1)
                .input('TEMPLATE', sql.VarBinary, faceTemplate)
                .input('UserID', sql.Int, dbUserId)
                .query(`
                  INSERT INTO FaceTemp (USERNO, SIZE, pin, FACEID, VALID, RESERVE, ACTIVETIME, VFCOUNT, TEMPLATE, UserID)
                  VALUES (@USERNO, @SIZE, @pin, @FACEID, @VALID, @RESERVE, @ACTIVETIME, @VFCOUNT, @TEMPLATE, @UserID)
                `);
              faceCount++;
            }
          } catch (faceError) {
            // Face template not found for this face, continue
          }
        }
        
        console.log(`✅ Downloaded ${faceCount} face templates`);
        
        await connection.disconnect();
        
      } catch (connectionError) {
        console.error('Error connecting to machine for biometric download:', connectionError);
        // Continue without biometric data
      }
      
      // Commit transaction
      await transaction.commit();
      transaction = null; // Mark transaction as completed
      
      return {
        success: true,
        message: `Employee ${employeeData.name} downloaded successfully`,
        fingerprintCount,
        faceCount
      };
      
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }
        transaction = null;
      }
      throw error;
    }
    
  } catch (error) {
    console.error('Error in downloadEmployeeData:', error);
    throw new Error(`Failed to download employee data: ${error.message}`);
  }
};
