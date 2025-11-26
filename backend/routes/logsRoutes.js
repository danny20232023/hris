// routes/logsRoutes.js
import express from 'express';
import sql from 'mssql';
import { getDb } from '../config/db.js';

const router = express.Router();

// GET /api/logs/:userid?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/:userid', async (req, res) => {
  const { userid } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const pool = getDb();

    // Convert date strings to datetime range to include the full day
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;

    const result = await pool
      .request()
      .input('userid', sql.Int, userid)
      .input('startDateTime', sql.VarChar, startDateTime)
      .input('endDateTime', sql.VarChar, endDateTime)
      .query(`
        SELECT *
        FROM CHECKINOUT
        WHERE USERID = @userid
          AND CHECKTIME >= @startDateTime
          AND CHECKTIME <= @endDateTime
        ORDER BY CHECKTIME ASC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('🔴 Failed to fetch logs:', error);
    res.status(500).json({ message: 'Error fetching logs', error: error.message });
  }
});

// POST /api/logs - Add new log entry
router.post('/', async (req, res) => {
  const { 
    USERID, 
    CHECKTIME, 
    CHECKTYPE = 'I', 
    VERIFYCODE = 1, 
    SENSORID = 101, 
    MEMOINFO = null, 
    WORKCODE = 0, 
    SN = 'CLXE224760198', 
    USEREXTFMT = 0 
  } = req.body;

  if (!USERID || !CHECKTIME) {
    return res.status(400).json({ message: 'USERID and CHECKTIME are required' });
  }

  try {
    const pool = getDb();
    
    console.log('📝 Adding new log entry:', {
      USERID,
      CHECKTIME,
      CHECKTYPE,
      VERIFYCODE,
      SENSORID,
      MEMOINFO,
      WORKCODE,
      SN,
      USEREXTFMT
    });

    // Parse and validate the CHECKTIME
    let parsedCheckTime;
    try {
      // Handle different date formats
      if (typeof CHECKTIME === 'string') {
        if (CHECKTIME.includes('T')) {
          parsedCheckTime = new Date(CHECKTIME);
        } else {
          // Handle 'YYYY-MM-DD HH:MM:SS' format
          parsedCheckTime = new Date(CHECKTIME.replace(' ', 'T'));
        }
      } else {
        parsedCheckTime = new Date(CHECKTIME);
      }
      
      if (isNaN(parsedCheckTime.getTime())) {
        throw new Error('Invalid date format');
      }
    } catch (dateError) {
      console.error('🔴 Invalid CHECKTIME format:', CHECKTIME, dateError);
      return res.status(400).json({ 
        message: 'Invalid CHECKTIME format. Expected format: YYYY-MM-DD HH:MM:SS or ISO string',
        received: CHECKTIME
      });
    }

    // FIXED: Simplified INSERT query without OUTPUT clause
    const result = await pool
      .request()
      .input('USERID', sql.Int, parseInt(USERID))
      .input('CHECKTIME', sql.DateTime, parsedCheckTime)
      .input('CHECKTYPE', sql.VarChar(1), CHECKTYPE)
      .input('VERIFYCODE', sql.Int, parseInt(VERIFYCODE))
      .input('SENSORID', sql.Int, parseInt(SENSORID))
      .input('MEMOINFO', sql.VarChar, MEMOINFO)
      .input('WORKCODE', sql.Int, parseInt(WORKCODE))
      .input('SN', sql.VarChar(50), SN)
      .input('USEREXTFMT', sql.Int, parseInt(USEREXTFMT))
      .query(`
        INSERT INTO CHECKINOUT (USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT)
        VALUES (@USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID, @MEMOINFO, @WORKCODE, @SN, @USEREXTFMT)
      `);

    console.log('✅ Log entry added successfully');
    res.status(201).json({ 
      message: 'Log entry added successfully',
      USERID,
      CHECKTIME: parsedCheckTime,
      CHECKTYPE,
      VERIFYCODE,
      SENSORID,
      MEMOINFO,
      WORKCODE,
      SN,
      USEREXTFMT
    });
  } catch (error) {
    console.error('🔴 Failed to add log entry:', error);
    res.status(500).json({ 
      message: 'Error adding log entry', 
      error: error.message,
      details: error.toString()
    });
  }
});

// PUT /api/logs/:id - Update existing log entry
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    CHECKTIME, 
    CHECKTYPE, 
    VERIFYCODE, 
    SENSORID, 
    MEMOINFO, 
    WORKCODE, 
    SN, 
    USEREXTFMT 
  } = req.body;

  if (!CHECKTIME) {
    return res.status(400).json({ message: 'CHECKTIME is required' });
  }

  try {
    const pool = getDb();
    
    console.log(' Updating log entry:', { id, ...req.body });

    // Parse CHECKTIME
    const parsedCheckTime = new Date(CHECKTIME);

    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .input('CHECKTIME', sql.DateTime, parsedCheckTime)
      .input('CHECKTYPE', sql.VarChar(1), CHECKTYPE)
      .input('VERIFYCODE', sql.Int, parseInt(VERIFYCODE))
      .input('SENSORID', sql.Int, parseInt(SENSORID))
      .input('MEMOINFO', sql.VarChar, MEMOINFO)
      .input('WORKCODE', sql.Int, parseInt(WORKCODE))
      .input('SN', sql.VarChar(50), SN)
      .input('USEREXTFMT', sql.Int, parseInt(USEREXTFMT))
      .query(`
        UPDATE CHECKINOUT 
        SET CHECKTIME = @CHECKTIME, 
            CHECKTYPE = @CHECKTYPE, 
            VERIFYCODE = @VERIFYCODE, 
            SENSORID = @SENSORID, 
            MEMOINFO = @MEMOINFO, 
            WORKCODE = @WORKCODE, 
            SN = @SN, 
            USEREXTFMT = @USEREXTFMT
        WHERE USERID = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    console.log('✅ Log entry updated successfully');
    res.json({ 
      message: 'Log entry updated successfully',
      id,
      CHECKTIME: parsedCheckTime
    });
  } catch (error) {
    console.error('🔴 Failed to update log entry:', error);
    res.status(500).json({ 
      message: 'Error updating log entry', 
      error: error.message,
      details: error.toString()
    });
  }
});

// DELETE /api/logs/:id - Delete log entry
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = getDb();
    
    console.log('🗑️ Deleting log entry:', { id });

    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        DELETE FROM CHECKINOUT 
        WHERE USERID = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    console.log('✅ Log entry deleted successfully');
    res.json({ message: 'Log entry deleted successfully' });
  } catch (error) {
    console.error('🔴 Failed to delete log entry:', error);
    res.status(500).json({ 
      message: 'Error deleting log entry', 
      error: error.message,
      details: error.toString()
    });
  }
});

export default router;