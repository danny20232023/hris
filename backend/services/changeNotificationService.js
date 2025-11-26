import { EventEmitter } from 'events';

class ChangeNotificationService extends EventEmitter {
  constructor() {
    super();
    // Map of emp_objid -> Set of SSE response objects
    this.connectedClients = new Map();
    // Map of USERID -> Set of SSE response objects (for admin users)
    this.adminClients = new Map();
  }

  /**
   * Register a new SSE client for an employee
   * @param {string} emp_objid - Employee object ID
   * @param {object} res - Express response object (SSE stream)
   * @param {number} userId - Optional USERID for admin users
   */
  registerClient(emp_objid, res, userId = null) {
    // Normalize emp_objid to string for consistent storage and lookup
    const normalizedEmpObjId = String(emp_objid);
    
    // Register by emp_objid (primary)
    if (!this.connectedClients.has(normalizedEmpObjId)) {
      this.connectedClients.set(normalizedEmpObjId, new Set());
    }
    this.connectedClients.get(normalizedEmpObjId).add(res);
    
    // Also register by USERID if provided (for admin users viewing multiple employees)
    if (userId) {
      if (!this.adminClients.has(userId)) {
        this.adminClients.set(userId, new Set());
      }
      this.adminClients.get(userId).add(res);
    }
    
    // Clean up on disconnect
    res.on('close', () => {
      this.unregisterClient(emp_objid, res, userId);
    });
    
    console.log(`✅ [SSE] Registered client for emp_objid: ${emp_objid} (normalized: ${normalizedEmpObjId})${userId ? `, userId: ${userId}` : ''}`);
  }

  /**
   * Unregister a client
   */
  unregisterClient(emp_objid, res, userId = null) {
    // Normalize emp_objid to string for consistent lookup
    const normalizedEmpObjId = String(emp_objid);
    const clients = this.connectedClients.get(normalizedEmpObjId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.connectedClients.delete(normalizedEmpObjId);
      }
    }
    
    if (userId) {
      const adminClients = this.adminClients.get(userId);
      if (adminClients) {
        adminClients.delete(res);
        if (adminClients.size === 0) {
          this.adminClients.delete(userId);
        }
      }
    }
    
    console.log(`🔌 [SSE] Unregistered client for emp_objid: ${emp_objid}`);
  }

  /**
   * Notify specific employee about data changes
   * @param {string} emp_objid - Employee object ID
   * @param {string} changeType - Type of change: 'leave', 'travel', 'locator', 'cdo', 'fix_logs'
   * @param {string} action - Action: 'created', 'updated', 'deleted', 'approved', 'rejected'
   * @param {object} metadata - Additional metadata (transactionId, date, etc.)
   */
  notifyEmployee(emp_objid, changeType, action, metadata = {}) {
    // Normalize emp_objid to string for consistent comparison
    const normalizedEmpObjId = String(emp_objid);
    
    // Enhanced logging for locator notifications
    if (changeType === 'locator') {
      console.log(`🔔 [SSE] [LOCATOR] Attempting to notify employee:`, {
        emp_objid,
        normalizedEmpObjId,
        changeType,
        action,
        metadata,
        connectedClientsCount: this.connectedClients.size,
        connectedClientKeys: Array.from(this.connectedClients.keys()).map(k => `${k} (type: ${typeof k})`)
      });
    }
    
    // Try to find client with exact match first
    let clients = this.connectedClients.get(normalizedEmpObjId);
    
    // If not found, try to find by comparing all keys as strings
    if (!clients || clients.size === 0) {
      for (const [key, value] of this.connectedClients.entries()) {
        if (String(key) === normalizedEmpObjId) {
          clients = value;
          break;
        }
      }
    }
    
    if (!clients || clients.size === 0) {
      // No clients connected for this employee
      console.log(`⚠️ [SSE] No connected clients found for emp_objid: ${emp_objid} (normalized: ${normalizedEmpObjId}, changeType: ${changeType}, action: ${action})`);
      console.log(`📊 [SSE] Current connected clients:`, Array.from(this.connectedClients.keys()).map(k => `${k} (${typeof k})`));
      return;
    }

    const message = {
      type: 'data_changed',
      changeType,
      action,
      emp_objid,
      metadata,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    clients.forEach(res => {
      try {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
        sentCount++;
      } catch (error) {
        console.error(`❌ [SSE] Error sending message to client:`, error);
        // Remove dead connection
        clients.delete(res);
      }
    });

    if (changeType === 'locator') {
      console.log(`✅ [SSE] [LOCATOR] Notified ${sentCount} client(s) for emp_objid: ${emp_objid}, changeType: ${changeType}, action: ${action}`, { metadata });
    } else {
      console.log(`📢 [SSE] Notified ${sentCount} client(s) for emp_objid: ${emp_objid}, changeType: ${changeType}, action: ${action}`);
    }
  }

  /**
   * Notify admin user (by USERID) - useful when admin makes changes
   * @param {number} userId - Admin USERID
   * @param {string} changeType - Type of change
   * @param {string} action - Action performed
   * @param {object} metadata - Additional metadata
   */
  notifyAdmin(userId, changeType, action, metadata = {}) {
    const clients = this.adminClients.get(userId);
    if (!clients || clients.size === 0) {
      return;
    }

    const message = {
      type: 'data_changed',
      changeType,
      action,
      userId,
      metadata,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;
    clients.forEach(res => {
      try {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
        sentCount++;
      } catch (error) {
        console.error(`❌ [SSE] Error sending message to admin client:`, error);
        clients.delete(res);
      }
    });

    console.log(`📢 [SSE] Notified ${sentCount} admin client(s) for userId: ${userId}, changeType: ${changeType}`);
  }

  /**
   * Notify both employee and admin (when admin makes change on behalf of employee)
   */
  notifyBoth(emp_objid, userId, changeType, action, metadata = {}) {
    this.notifyEmployee(emp_objid, changeType, action, metadata);
    if (userId) {
      this.notifyAdmin(userId, changeType, action, metadata);
    }
  }

  /**
   * Get connection stats (for debugging)
   */
  getStats() {
    return {
      employeeConnections: this.connectedClients.size,
      adminConnections: this.adminClients.size,
      totalClients: Array.from(this.connectedClients.values()).reduce((sum, set) => sum + set.size, 0) +
                   Array.from(this.adminClients.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }
}

// Export singleton instance
export const changeNotificationService = new ChangeNotificationService();

