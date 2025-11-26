import { getDb } from '../config/db.js';
import sql from 'mssql';

export const searchEmployees = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = getDb();
    const request = pool.request();
    let query = `
      SELECT TOP 50 USERID, NAME, BADGENUMBER
      FROM USERINFO
      WHERE privilege != -1
    `;
    if (search.trim()) {
      query += ' AND (NAME LIKE @search OR BADGENUMBER LIKE @search)';
      request.input('search', sql.VarChar, `%${search.trim()}%`);
    }
    query += ' ORDER BY NAME';

    const result = await request.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error searching employees:', error);
    res.status(500).json({ success: false, message: 'Failed to search employees' });
  }
};

const buildDateFilters = (params, whereClause, inputs) => {
  if (params.dateFrom && params.dateTo) {
    whereClause.push('CAST(CHECKTIME AS DATE) BETWEEN @dateFrom AND @dateTo');
    inputs.push({ name: 'dateFrom', type: sql.Date, value: params.dateFrom });
    inputs.push({ name: 'dateTo', type: sql.Date, value: params.dateTo });
  } else if (params.month && params.year) {
    whereClause.push('MONTH(CAST(CHECKTIME AS DATE)) = @month');
    whereClause.push('YEAR(CAST(CHECKTIME AS DATE)) = @year');
    inputs.push({ name: 'month', type: sql.Int, value: parseInt(params.month, 10) });
    inputs.push({ name: 'year', type: sql.Int, value: parseInt(params.year, 10) });
  }
};

export const getRecords = async (req, res) => {
  try {
    const { userId, month, year, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
    const pool = getDb();
    const whereParts = ['1=1'];
    const inputs = [];

    if (userId) {
      whereParts.push('USERID = @userId');
      inputs.push({ name: 'userId', type: sql.Int, value: parseInt(userId, 10) });
    }

    buildDateFilters({ month, year, dateFrom, dateTo }, whereParts, inputs);

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const countRequest = pool.request();
    inputs.forEach(({ name, type, value }) => countRequest.input(name, type, value));
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM CHECKINOUT ${whereClause}`);
    const totalRecords = countResult.recordset[0].total;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const offset = (pageNum - 1) * limitNum;

    const dataRequest = pool.request();
    inputs.forEach(({ name, type, value }) => dataRequest.input(name, type, value));
    dataRequest.input('startRow', sql.Int, offset + 1);
    dataRequest.input('endRow', sql.Int, offset + limitNum);

    const dataQuery = `
      SELECT USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT
      FROM (
        SELECT
          USERID,
          CHECKTIME,
          CHECKTYPE,
          VERIFYCODE,
          SENSORID,
          MEMOINFO,
          WORKCODE,
          SN,
          USEREXTFMT,
          ROW_NUMBER() OVER (ORDER BY CHECKTIME DESC) AS RowNum
        FROM CHECKINOUT
        ${whereClause}
      ) AS paginated
      WHERE RowNum BETWEEN @startRow AND @endRow
      ORDER BY RowNum
    `;

    const dataResult = await dataRequest.query(dataQuery);

    res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        currentPage: pageNum,
        recordsPerPage: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Error fetching CHECKINOUT records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records' });
  }
};

const decodeCheckTimeParam = (value) => decodeURIComponent(value).replace(/_/g, ' ');

export const getRecordById = async (req, res) => {
  try {
    const { userId, checkTime } = req.params;
    if (!userId || !checkTime) {
      return res.status(400).json({ success: false, message: 'USERID and CHECKTIME are required' });
    }

    const pool = getDb();
    const decodedCheckTime = decodeCheckTimeParam(checkTime);
    const result = await pool.request()
      .input('userId', sql.Int, parseInt(userId, 10))
      .input('checkTime', sql.VarChar(50), decodedCheckTime)
      .query(`
        SELECT USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT
        FROM CHECKINOUT
        WHERE USERID = @userId AND CHECKTIME = @checkTime
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch record' });
  }
};

export const createRecord = async (req, res) => {
  try {
    const {
      USERID,
      CHECKTIME,
      CHECKTYPE,
      VERIFYCODE,
      SENSORID,
      MEMOINFO,
      WORKCODE,
      SN,
      USEREXTFMT
    } = req.body;

    if (!USERID || !CHECKTIME) {
      return res.status(400).json({ success: false, message: 'USERID and CHECKTIME are required' });
    }

    const pool = getDb();
    const existing = await pool.request()
      .input('USERID', sql.Int, parseInt(USERID, 10))
      .input('CHECKTIME', sql.VarChar(50), CHECKTIME)
      .query('SELECT COUNT(*) AS count FROM CHECKINOUT WHERE USERID = @USERID AND CHECKTIME = @CHECKTIME');

    if (existing.recordset[0].count > 0) {
      return res.status(409).json({ success: false, message: 'Record already exists for this USERID and CHECKTIME' });
    }

    await pool.request()
      .input('USERID', sql.Int, parseInt(USERID, 10))
      .input('CHECKTIME', sql.VarChar(50), CHECKTIME)
      .input('CHECKTYPE', sql.VarChar(1), CHECKTYPE || 'I')
      .input('VERIFYCODE', sql.Int, VERIFYCODE || 1)
      .input('SENSORID', sql.VarChar(20), SENSORID || '')
      .input('MEMOINFO', sql.VarChar(100), MEMOINFO || '')
      .input('WORKCODE', sql.Int, WORKCODE || 0)
      .input('SN', sql.VarChar(50), SN || '')
      .input('USEREXTFMT', sql.VarChar(100), USEREXTFMT || '')
      .query(`
        INSERT INTO CHECKINOUT
        (USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT)
        VALUES
        (@USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID, @MEMOINFO, @WORKCODE, @SN, @USEREXTFMT)
      `);

    res.json({ success: true, message: 'Record created successfully' });
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({ success: false, message: 'Failed to create record' });
  }
};

export const updateRecord = async (req, res) => {
  try {
    const { userId, checkTime } = req.params;
    const {
      USERID,
      CHECKTIME,
      CHECKTYPE,
      VERIFYCODE,
      SENSORID,
      MEMOINFO,
      WORKCODE,
      SN,
      USEREXTFMT
    } = req.body;

    if (!userId || !checkTime) {
      return res.status(400).json({ success: false, message: 'Original USERID and CHECKTIME are required' });
    }

    if (!USERID || !CHECKTIME) {
      return res.status(400).json({ success: false, message: 'USERID and CHECKTIME are required in payload' });
    }

    const pool = getDb();
    const decodedCheckTime = decodeCheckTimeParam(checkTime);

    const existing = await pool.request()
      .input('userId', sql.Int, parseInt(userId, 10))
      .input('checkTime', sql.VarChar(50), decodedCheckTime)
      .query('SELECT COUNT(*) AS count FROM CHECKINOUT WHERE USERID = @userId AND CHECKTIME = @checkTime');

    if (!existing.recordset[0].count) {
      return res.status(404).json({ success: false, message: 'Original record not found' });
    }

    // If changing key, ensure no duplicates
    if (parseInt(USERID, 10) !== parseInt(userId, 10) || CHECKTIME !== decodedCheckTime) {
      const duplicate = await pool.request()
        .input('USERID', sql.Int, parseInt(USERID, 10))
        .input('CHECKTIME', sql.VarChar(50), CHECKTIME)
        .query('SELECT COUNT(*) AS count FROM CHECKINOUT WHERE USERID = @USERID AND CHECKTIME = @CHECKTIME');
      if (duplicate.recordset[0].count) {
        return res.status(409).json({ success: false, message: 'Target USERID and CHECKTIME already exist' });
      }
    }

    await pool.request()
      .input('originalUserId', sql.Int, parseInt(userId, 10))
      .input('originalCheckTime', sql.VarChar(50), decodedCheckTime)
      .query('DELETE FROM CHECKINOUT WHERE USERID = @originalUserId AND CHECKTIME = @originalCheckTime');

    await pool.request()
      .input('USERID', sql.Int, parseInt(USERID, 10))
      .input('CHECKTIME', sql.VarChar(50), CHECKTIME)
      .input('CHECKTYPE', sql.VarChar(1), CHECKTYPE || 'I')
      .input('VERIFYCODE', sql.Int, VERIFYCODE || 1)
      .input('SENSORID', sql.VarChar(20), SENSORID || '')
      .input('MEMOINFO', sql.VarChar(100), MEMOINFO || '')
      .input('WORKCODE', sql.Int, WORKCODE || 0)
      .input('SN', sql.VarChar(50), SN || '')
      .input('USEREXTFMT', sql.VarChar(100), USEREXTFMT || '')
      .query(`
        INSERT INTO CHECKINOUT
        (USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT)
        VALUES
        (@USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID, @MEMOINFO, @WORKCODE, @SN, @USEREXTFMT)
      `);

    res.json({ success: true, message: 'Record updated successfully' });
  } catch (error) {
    console.error('Error updating record:', error);
    res.status(500).json({ success: false, message: 'Failed to update record' });
  }
};

export const deleteRecord = async (req, res) => {
  try {
    const { userId, checkTime } = req.params;
    if (!userId || !checkTime) {
      return res.status(400).json({ success: false, message: 'USERID and CHECKTIME are required' });
    }

    const pool = getDb();
    const decodedCheckTime = decodeCheckTimeParam(checkTime);

    const existing = await pool.request()
      .input('userId', sql.Int, parseInt(userId, 10))
      .input('checkTime', sql.VarChar(50), decodedCheckTime)
      .query('SELECT COUNT(*) AS count FROM CHECKINOUT WHERE USERID = @userId AND CHECKTIME = @checkTime');

    if (!existing.recordset[0].count) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    await pool.request()
      .input('userId', sql.Int, parseInt(userId, 10))
      .input('checkTime', sql.VarChar(50), decodedCheckTime)
      .query('DELETE FROM CHECKINOUT WHERE USERID = @userId AND CHECKTIME = @checkTime');

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete record' });
  }
};

