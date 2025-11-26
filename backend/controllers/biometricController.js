import { getDb } from '../config/db.js';
import sql from 'mssql';

// Get all employees with their bio enrollment status
export const getEmployeesBioStatus = async (req, res) => {
  try {
    const pool = getDb();

    const result = await pool.request().query(`
      SELECT 
        u.USERID,
        u.BADGENUMBER,
        u.NAME,
        u.DEFAULTDEPTID,
        d.DEPTNAME,
        ISNULL((
          SELECT COUNT(*) 
          FROM FingerTemplates ft 
          WHERE ft.USERID = u.USERID 
            AND ft.FINGERTEMPLATE IS NOT NULL 
            AND DATALENGTH(ft.FINGERTEMPLATE) > 0
        ), 0) as BIO_COUNT
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      WHERE u.privilege != -1
      ORDER BY u.NAME
    `);

    res.json({
      success: true,
      employees: result.recordset
    });

  } catch (error) {
    console.error('Error fetching employees bio status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get enrolled fingers for a user
export const getEnrolledFingers = async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = getDb();

    const result = await pool.request()
      .input('USERID', sql.Int, userId)
      .query(`
        SELECT FINGERID, FUID, NAME, CREATEDDATE
        FROM FingerTemplates
        WHERE USERID = @USERID
          AND FINGERTEMPLATE IS NOT NULL
          AND DATALENGTH(FINGERTEMPLATE) > 0
        ORDER BY FINGERID
      `);

    res.json({
      success: true,
      fingers: result.recordset.map(row => row.FINGERID)
    });

  } catch (error) {
    console.error('Error fetching enrolled fingers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// Delete enrolled finger
export const deleteFinger = async (req, res) => {
  try {
    const { userId, fingerId } = req.params;
    const pool = getDb();

    const result = await pool.request()
      .input('USERID', sql.Int, userId)
      .input('FINGERID', sql.Int, fingerId)
      .query(`
        DELETE FROM FingerTemplates
        WHERE USERID = @USERID AND FINGERID = @FINGERID
      `);

    console.log(`🗑️ Deleted finger ${fingerId} for user ${userId} - Rows affected: ${result.rowsAffected[0]}`);

    res.json({
      success: true,
      message: `Finger ${fingerId} deleted for user ${userId}`,
      rowsAffected: result.rowsAffected[0]
    });

  } catch (error) {
    console.error('Error deleting finger:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};