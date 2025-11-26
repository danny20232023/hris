import { getHR201Pool } from '../config/hr201Database.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// ============================================
// HOLIDAY TYPES CRUD
// ============================================

export const getHolidayTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute(
      'SELECT * FROM holidaytypes ORDER BY typesname ASC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching holiday types:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holiday types', error: error.message });
  }
};

export const getHolidayTypeById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM holidaytypes WHERE id = ? LIMIT 1',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Holiday type not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching holiday type:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holiday type', error: error.message });
  }
};

export const createHolidayType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { typesname } = req.body;

    if (!typesname || !typesname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Type name is required'
      });
    }

    // Check if holiday type name already exists
    const [existingRows] = await pool.execute(
      'SELECT id FROM holidaytypes WHERE typesname = ? LIMIT 1',
      [typesname.trim()]
    );

    if (existingRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Holiday type name already exists'
      });
    }

    const [result] = await pool.execute(
      'INSERT INTO holidaytypes (typesname) VALUES (?)',
      [typesname.trim()]
    );

    res.status(201).json({
      success: true,
      message: 'Holiday type created successfully',
      data: { id: result.insertId, typesname: typesname.trim() }
    });
  } catch (error) {
    console.error('Error creating holiday type:', error);
    res.status(500).json({ success: false, message: 'Failed to create holiday type', error: error.message });
  }
};

export const updateHolidayType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { typesname } = req.body;

    if (!typesname || !typesname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Type name is required'
      });
    }

    // Check if holiday type exists
    const [existingRows] = await pool.execute(
      'SELECT id FROM holidaytypes WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday type not found'
      });
    }

    // Check if new name already exists (excluding current record)
    const [duplicateRows] = await pool.execute(
      'SELECT id FROM holidaytypes WHERE typesname = ? AND id != ? LIMIT 1',
      [typesname.trim(), id]
    );

    if (duplicateRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Holiday type name already exists'
      });
    }

    await pool.execute(
      'UPDATE holidaytypes SET typesname = ? WHERE id = ?',
      [typesname.trim(), id]
    );

    res.json({
      success: true,
      message: 'Holiday type updated successfully',
      data: { id: parseInt(id), typesname: typesname.trim() }
    });
  } catch (error) {
    console.error('Error updating holiday type:', error);
    res.status(500).json({ success: false, message: 'Failed to update holiday type', error: error.message });
  }
};

export const deleteHolidayType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;

    // Check if holiday type is in use
    const [usageRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM holidays WHERE holidaytype = ?',
      [id]
    );

    if (usageRows[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete holiday type: it is being used by existing holidays'
      });
    }

    // Check if holiday type exists
    const [existingRows] = await pool.execute(
      'SELECT id FROM holidaytypes WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday type not found'
      });
    }

    await pool.execute(
      'DELETE FROM holidaytypes WHERE id = ?',
      [id]
    );

    res.json({ success: true, message: 'Holiday type deleted successfully' });
  } catch (error) {
    console.error('Error deleting holiday type:', error);
    res.status(500).json({ success: false, message: 'Failed to delete holiday type', error: error.message });
  }
};

// ============================================
// HOLIDAYS CRUD
// ============================================

export const getHolidays = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute(
      `SELECT 
        h.*,
        DATE_FORMAT(h.holidaydate, '%Y-%m-%d') AS holidaydate_formatted,
        ht.typesname AS holiday_type_name,
        s.username AS createdby_username,
        s.photo AS createdby_photo,
        e.surname AS createdby_surname,
        e.firstname AS createdby_firstname,
        e.middlename AS createdby_middlename
      FROM holidays h
      LEFT JOIN holidaytypes ht ON h.holidaytype = ht.id
      LEFT JOIN sysusers s ON h.createdby = s.id
      LEFT JOIN employees e ON s.emp_objid = e.objid
      ORDER BY h.holidaydate DESC`
    );
    
    // Convert photo blobs to base64 and format names
    const holidaysWithPhotos = rows.map(row => {
      if (row.createdby_photo) {
        try {
          // Convert Buffer to base64
          const photoBuffer = Buffer.isBuffer(row.createdby_photo) 
            ? row.createdby_photo 
            : Buffer.from(row.createdby_photo);
          
          if (photoBuffer.length > 0) {
            row.createdby_photo = `data:image/png;base64,${photoBuffer.toString('base64')}`;
          } else {
            row.createdby_photo = null;
          }
        } catch (error) {
          console.error('Error converting createdby photo:', error);
          row.createdby_photo = null;
        }
      } else {
        row.createdby_photo = null;
      }
      
      // Use the formatted date from SQL (YYYY-MM-DD string) to avoid any datetime conversion
      // The database stores the correct date value, DATE_FORMAT returns it as-is
      if (row.holidaydate_formatted) {
        row.holidaydate = row.holidaydate_formatted;
      } else if (row.holidaydate) {
        // Fallback: extract date part directly without conversion
        if (row.holidaydate instanceof Date) {
          // Extract date part from ISO string (YYYY-MM-DD) before 'T'
          const isoString = row.holidaydate.toISOString();
          const dateMatch = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            row.holidaydate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          }
        } else if (typeof row.holidaydate === 'string') {
          // Extract date part directly from string (YYYY-MM-DD) before 'T' or space
          const dateMatch = row.holidaydate.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            row.holidaydate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          }
        }
      }
      
      // Format employee name
      row.createdby_employee_name = formatEmployeeName(row.createdby_surname, row.createdby_firstname, row.createdby_middlename);
      return row;
    });
    
    res.json({ success: true, data: holidaysWithPhotos });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holidays', error: error.message });
  }
};

export const getHolidayById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT 
        h.*,
        DATE_FORMAT(h.holidaydate, '%Y-%m-%d') AS holidaydate_formatted,
        ht.typesname AS holiday_type_name,
        s.username AS createdby_username,
        s.photo AS createdby_photo,
        e.surname AS createdby_surname,
        e.firstname AS createdby_firstname,
        e.middlename AS createdby_middlename
      FROM holidays h
      LEFT JOIN holidaytypes ht ON h.holidaytype = ht.id
      LEFT JOIN sysusers s ON h.createdby = s.id
      LEFT JOIN employees e ON s.emp_objid = e.objid
      WHERE h.id = ? LIMIT 1`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }
    
    // Convert photo blob to base64 and format names
    const holiday = rows[0];
    if (holiday.createdby_photo) {
      try {
        const photoBuffer = Buffer.isBuffer(holiday.createdby_photo) 
          ? holiday.createdby_photo 
          : Buffer.from(holiday.createdby_photo);
        
        if (photoBuffer.length > 0) {
          holiday.createdby_photo = `data:image/png;base64,${photoBuffer.toString('base64')}`;
        } else {
          holiday.createdby_photo = null;
        }
      } catch (error) {
        console.error('Error converting createdby photo:', error);
        holiday.createdby_photo = null;
      }
    } else {
      holiday.createdby_photo = null;
    }
    
    // Use the formatted date from SQL (YYYY-MM-DD string) to avoid any datetime conversion
    if (holiday.holidaydate_formatted) {
      holiday.holidaydate = holiday.holidaydate_formatted;
    } else if (holiday.holidaydate) {
      // Fallback: extract date part directly without conversion
      if (holiday.holidaydate instanceof Date) {
        const isoString = holiday.holidaydate.toISOString();
        const dateMatch = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          holiday.holidaydate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
      } else if (typeof holiday.holidaydate === 'string') {
        const dateMatch = holiday.holidaydate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          holiday.holidaydate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
      }
    }
    
    // Format employee name
    holiday.createdby_employee_name = formatEmployeeName(holiday.createdby_surname, holiday.createdby_firstname, holiday.createdby_middlename);
    
    res.json({ success: true, data: holiday });
  } catch (error) {
    console.error('Error fetching holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holiday', error: error.message });
  }
};

export const createHoliday = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const {
      holidayname,
      holidaycategory,
      holidaytype,
      holidaydesc,
      holidaydate,
      isrecurring,
      status
    } = req.body;

    // Validate required fields
    if (!holidayname || !holidayname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Holiday name is required'
      });
    }

    if (!holidaycategory || !['Local', 'National'].includes(holidaycategory)) {
      return res.status(400).json({
        success: false,
        message: 'Holiday category is required and must be Local or National'
      });
    }

    if (!holidaytype) {
      return res.status(400).json({
        success: false,
        message: 'Holiday type is required'
      });
    }

    if (!holidaydate) {
      return res.status(400).json({
        success: false,
        message: 'Holiday date is required'
      });
    }

    // Get logged-in user ID from JWT
    const createdby = req.user?.USERID;
    if (!createdby) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get current date/time
    const createddate = new Date();

    // Insert holiday
    const [result] = await pool.execute(
      `INSERT INTO holidays 
        (holidayname, holidaycategory, holidaytype, holidaydesc, holidaydate, isrecurring, createdby, createddate, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        holidayname.trim(),
        holidaycategory,
        holidaytype,
        holidaydesc || null,
        holidaydate,
        isrecurring ? 1 : 0,
        createdby,
        createddate,
        status !== undefined ? status : 1
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to create holiday', error: error.message });
  }
};

export const updateHoliday = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const {
      holidayname,
      holidaycategory,
      holidaytype,
      holidaydesc,
      holidaydate,
      isrecurring,
      status
    } = req.body;

    // Check if holiday exists
    const [existingRows] = await pool.execute(
      'SELECT id FROM holidays WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    // Validate required fields
    if (!holidayname || !holidayname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Holiday name is required'
      });
    }

    if (!holidaycategory || !['Local', 'National'].includes(holidaycategory)) {
      return res.status(400).json({
        success: false,
        message: 'Holiday category is required and must be Local or National'
      });
    }

    if (!holidaytype) {
      return res.status(400).json({
        success: false,
        message: 'Holiday type is required'
      });
    }

    if (!holidaydate) {
      return res.status(400).json({
        success: false,
        message: 'Holiday date is required'
      });
    }

    // Update holiday
    await pool.execute(
      `UPDATE holidays SET 
        holidayname = ?,
        holidaycategory = ?,
        holidaytype = ?,
        holidaydesc = ?,
        holidaydate = ?,
        isrecurring = ?,
        status = ?
      WHERE id = ?`,
      [
        holidayname.trim(),
        holidaycategory,
        holidaytype,
        holidaydesc || null,
        holidaydate,
        isrecurring ? 1 : 0,
        status !== undefined ? status : 1,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Holiday updated successfully',
      data: { id: parseInt(id) }
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to update holiday', error: error.message });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;

    // Check if holiday exists
    const [existingRows] = await pool.execute(
      'SELECT id FROM holidays WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    await pool.execute(
      'DELETE FROM holidays WHERE id = ?',
      [id]
    );

    res.json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to delete holiday', error: error.message });
  }
};
