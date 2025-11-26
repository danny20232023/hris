import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { getHR201Pool } from '../config/hr201Database.js';

const router = express.Router();

/**
 * GET /api/change-notifications/stream
 * SSE endpoint for real-time change notifications
 * Clients connect here and receive notifications when their data changes
 * Note: EventSource doesn't support custom headers, so token is passed as query param
 */
router.get('/stream', async (req, res) => {
  try {
    // EventSource doesn't support custom headers, so check for token in query params
    let token = req.query.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token'
      });
    }
    
    // Verify token
    const jwt = await import('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed'
      });
    }
    
    const userId = decoded.USERID || decoded.id;
    let emp_objid = decoded.emp_objid;

    // If emp_objid not in token, try to get it from sysusers_portal
    if (!emp_objid) {
      const pool = getHR201Pool();
      const [rows] = await pool.execute(
        'SELECT emp_objid FROM sysusers_portal WHERE id = ?',
        [userId]
      );
      if (rows.length > 0) {
        emp_objid = rows[0].emp_objid;
      }
    }

    if (!emp_objid) {
      return res.status(400).json({
        success: false,
        message: 'Employee object ID not found'
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      message: 'Connected to change notification stream',
      emp_objid,
      userId,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Register this client
    console.log(`📝 [SSE] Registering client: emp_objid=${emp_objid} (type: ${typeof emp_objid}), userId=${userId}`);
    changeNotificationService.registerClient(emp_objid, res, userId);
    console.log(`✅ [SSE] Client registered. Current stats:`, changeNotificationService.getStats());

    // Keep connection alive with heartbeat (every 30 seconds)
    const heartbeat = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
      } catch (error) {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      changeNotificationService.unregisterClient(emp_objid, res, userId);
      res.end();
      console.log(`🔌 [SSE] Client disconnected: emp_objid=${emp_objid}, userId=${userId}`);
    });

    // Handle client errors
    res.on('error', (error) => {
      console.error(`❌ [SSE] Stream error:`, error);
      clearInterval(heartbeat);
      changeNotificationService.unregisterClient(emp_objid, res, userId);
    });

  } catch (error) {
    console.error('❌ [SSE] Error setting up stream:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting up notification stream',
      error: error.message
    });
  }
});

/**
 * GET /api/change-notifications/stats
 * Get connection statistics (for debugging)
 */
router.get('/stats', protect, (req, res) => {
  const stats = changeNotificationService.getStats();
  res.json({
    success: true,
    stats
  });
});

export default router;

