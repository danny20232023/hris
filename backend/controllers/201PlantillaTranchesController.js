import { getHR201Pool } from '../config/hr201Database.js';

// GET /api/201-plantilla-tranches - Get all tranches with pagination, search, and filters
export const getAllTranches = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = Math.max(0, (pageNum - 1) * limitNum);
    
    const whereConditions = [];
    const params = [];
    
    // Search filter
    if (search) {
      whereConditions.push(`(t.tranche LIKE ? OR t.implement_year LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }
    
    // Status filter
    if (status && status !== 'all') {
      whereConditions.push(`t.tranchestatus = ?`);
      params.push(status);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM salarytranches t
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;
    
    // Ensure limitNum and offset are proper integers
    const finalLimit = parseInt(String(limitNum), 10);
    const finalOffset = parseInt(String(offset), 10);
    
    // Validate parameters
    if (isNaN(finalLimit) || isNaN(finalOffset) || finalLimit < 1 || finalOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters',
        error: `limit: ${finalLimit}, offset: ${finalOffset}`
      });
    }
    
    // Fetch records with pagination
    let query = `
      SELECT 
        t.tranche_id,
        t.implement_year,
        t.tranche,
        t.tranche_percent,
        t.tranche_percent_increase,
        t.salaryclassid,
        t.supportingid,
        t.createdby,
        t.createddate,
        t.updatedby,
        t.updateddate,
        t.tranchestatus,
        sc.classname,
        sc.classtype,
        sc.percentage as salaryclass_percentage,
        COUNT(DISTINCT r.rate_id) as rates_count
      FROM salarytranches t
      LEFT JOIN salarytranches_rates r ON r.tranche_id = t.tranche_id
      LEFT JOIN salaryclass sc ON sc.id = t.salaryclassid
      ${whereClause}
      GROUP BY t.tranche_id
      ORDER BY t.implement_year DESC, t.tranche ASC
      LIMIT ${finalLimit} OFFSET ${finalOffset}
    `;
    
    const [tranches] = await pool.execute(query, params);
    
    res.json({
      success: true,
      data: tranches,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching tranches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tranches',
      error: error.message
    });
  }
};

// GET /api/201-plantilla-tranches/:id - Get single tranche by id
export const getTrancheById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const query = `
      SELECT 
        t.*,
        COUNT(DISTINCT r.rate_id) as rates_count
      FROM salarytranches t
      LEFT JOIN salarytranches_rates r ON r.tranche_id = t.tranche_id
      WHERE t.tranche_id = ?
      GROUP BY t.tranche_id
    `;
    
    const [records] = await pool.execute(query, [id]);
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tranche not found'
      });
    }
    
    res.json({
      success: true,
      data: records[0]
    });
  } catch (error) {
    console.error('❌ Error fetching tranche:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tranche',
      error: error.message
    });
  }
};

// POST /api/201-plantilla-tranches - Create new tranche
export const createTranche = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const userId = req.user?.id || req.user?.USERID;
    
    const {
      implement_year,
      tranche,
      tranche_percent,
      tranche_percent_increase,
      salaryclassid,
      supportingid,
      tranchestatus
    } = req.body;
    
    // Validate required fields
    if (!tranche || !tranche.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: tranche'
      });
    }
    
    await pool.query('START TRANSACTION');
    
    try {
      // Insert tranche record
      const insertQuery = `
        INSERT INTO salarytranches (
          implement_year, tranche, tranche_percent, tranche_percent_increase, salaryclassid, supportingid,
          tranchestatus, createdby, createddate, updatedby, updateddate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `;
      
      const [result] = await pool.execute(insertQuery, [
        implement_year || null,
        tranche.trim(),
        tranche_percent || null,
        tranche_percent_increase || null,
        salaryclassid || null,
        supportingid || null,
        tranchestatus || 'Active',
        userId,
        userId
      ]);
      
      const trancheId = result.insertId;
      
      await pool.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Tranche created successfully',
        data: { tranche_id: trancheId }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error creating tranche:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tranche',
      error: error.message
    });
  }
};

// PUT /api/201-plantilla-tranches/:id - Update tranche
export const updateTranche = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const userId = req.user?.id || req.user?.USERID;
    
    const {
      implement_year,
      tranche,
      tranche_percent,
      tranche_percent_increase,
      salaryclassid,
      supportingid,
      tranchestatus
    } = req.body;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Update tranche record
      const updateFields = [];
      const updateParams = [];
      
      if (implement_year !== undefined) { updateFields.push('implement_year = ?'); updateParams.push(implement_year); }
      if (tranche !== undefined) { updateFields.push('tranche = ?'); updateParams.push(tranche.trim()); }
      if (tranche_percent !== undefined) { updateFields.push('tranche_percent = ?'); updateParams.push(tranche_percent); }
      if (tranche_percent_increase !== undefined) { updateFields.push('tranche_percent_increase = ?'); updateParams.push(tranche_percent_increase); }
      if (salaryclassid !== undefined) { updateFields.push('salaryclassid = ?'); updateParams.push(salaryclassid === '' ? null : salaryclassid); }
      if (supportingid !== undefined) { updateFields.push('supportingid = ?'); updateParams.push(supportingid); }
      if (tranchestatus !== undefined) { updateFields.push('tranchestatus = ?'); updateParams.push(tranchestatus); }
      
      updateFields.push('updatedby = ?');
      updateFields.push('updateddate = NOW()');
      updateParams.push(userId);
      updateParams.push(id);
      
      const updateQuery = `
        UPDATE salarytranches
        SET ${updateFields.join(', ')}
        WHERE tranche_id = ?
      `;
      
      const [result] = await pool.execute(updateQuery, updateParams);
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Tranche not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Tranche updated successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error updating tranche:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tranche',
      error: error.message
    });
  }
};

// DELETE /api/201-plantilla-tranches/:id - Delete tranche
export const deleteTranche = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Check for related rates
      const [ratesCheck] = await pool.execute(
        'SELECT COUNT(*) as count FROM salarytranches_rates WHERE tranche_id = ?',
        [id]
      );
      
      if (ratesCheck[0].count > 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Cannot delete tranche with existing rates. Please delete rates first.'
        });
      }
      
      // Delete tranche record
      const [result] = await pool.execute('DELETE FROM salarytranches WHERE tranche_id = ?', [id]);
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Tranche not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Tranche deleted successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error deleting tranche:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tranche',
      error: error.message
    });
  }
};

// GET /api/201-plantilla-tranches/:trancheId/rates - Get all rates for a tranche (pivoted)
export const getTrancheRates = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { trancheId } = req.params;
    
    // Verify tranche exists
    const [trancheCheck] = await pool.execute(
      'SELECT tranche_id, implement_year FROM salarytranches WHERE tranche_id = ?',
      [trancheId]
    );
    
    if (trancheCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tranche not found'
      });
    }
    
    const tranche = trancheCheck[0];
    
    // Fetch all rates for this tranche
    const query = `
      SELECT 
        rate_id,
        tranche_id,
        implement_year,
        salarygrade,
        stepincrement,
        rate
      FROM salarytranches_rates
      WHERE tranche_id = ?
      ORDER BY salarygrade ASC, stepincrement ASC
    `;
    
    const [rates] = await pool.execute(query, [trancheId]);
    
    res.json({
      success: true,
      data: rates,
      tranche: {
        tranche_id: tranche.tranche_id,
        implement_year: tranche.implement_year
      }
    });
  } catch (error) {
    console.error('❌ Error fetching tranche rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tranche rates',
      error: error.message
    });
  }
};

// POST /api/201-plantilla-tranches/:trancheId/rates - Create/update rates for a tranche
export const saveTrancheRates = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { trancheId } = req.params;
    const { rates } = req.body;
    
    if (!Array.isArray(rates)) {
      return res.status(400).json({
        success: false,
        message: 'rates must be an array'
      });
    }
    
    // Verify tranche exists
    const [trancheCheck] = await pool.execute(
      'SELECT tranche_id, implement_year FROM salarytranches WHERE tranche_id = ?',
      [trancheId]
    );
    
    if (trancheCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tranche not found'
      });
    }
    
    const tranche = trancheCheck[0];
    const implementYear = tranche.implement_year;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Process each rate
      for (const rateData of rates) {
        const { salarygrade, stepincrement, rate } = rateData;
        
        if (!salarygrade || !stepincrement) {
          continue; // Skip invalid entries
        }
        
        // Check if rate already exists
        const [existing] = await pool.execute(
          `SELECT rate_id FROM salarytranches_rates 
           WHERE tranche_id = ? AND salarygrade = ? AND stepincrement = ?`,
          [trancheId, salarygrade, stepincrement]
        );
        
        if (existing.length > 0) {
          // Update existing rate
          await pool.execute(
            `UPDATE salarytranches_rates 
             SET rate = ?, implement_year = ?
             WHERE rate_id = ?`,
            [rate, implementYear, existing[0].rate_id]
          );
        } else {
          // Insert new rate
          await pool.execute(
            `INSERT INTO salarytranches_rates 
             (tranche_id, implement_year, salarygrade, stepincrement, rate)
             VALUES (?, ?, ?, ?, ?)`,
            [trancheId, implementYear, salarygrade, stepincrement, rate]
          );
        }
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Rates saved successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error saving tranche rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save tranche rates',
      error: error.message
    });
  }
};

// PUT /api/201-plantilla-tranches/:trancheId/rates/:rateId - Update single rate
export const updateTrancheRate = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { trancheId, rateId } = req.params;
    const { rate } = req.body;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Verify rate belongs to tranche
      const [rateCheck] = await pool.execute(
        'SELECT rate_id FROM salarytranches_rates WHERE rate_id = ? AND tranche_id = ?',
        [rateId, trancheId]
      );
      
      if (rateCheck.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Rate not found'
        });
      }
      
      // Update rate
      const [result] = await pool.execute(
        'UPDATE salarytranches_rates SET rate = ? WHERE rate_id = ?',
        [rate, rateId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Rate not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Rate updated successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error updating tranche rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tranche rate',
      error: error.message
    });
  }
};

// DELETE /api/201-plantilla-tranches/:trancheId/rates/:rateId - Delete single rate
export const deleteTrancheRate = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { trancheId, rateId } = req.params;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Verify rate belongs to tranche
      const [rateCheck] = await pool.execute(
        'SELECT rate_id FROM salarytranches_rates WHERE rate_id = ? AND tranche_id = ?',
        [rateId, trancheId]
      );
      
      if (rateCheck.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Rate not found'
        });
      }
      
      // Delete rate
      const [result] = await pool.execute(
        'DELETE FROM salarytranches_rates WHERE rate_id = ?',
        [rateId]
      );
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Rate not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Rate deleted successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error deleting tranche rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tranche rate',
      error: error.message
    });
  }
};

// GET /api/201-plantilla-tranches/:trancheId/rates/:salarygrade/:stepincrement - Get specific rate
export const getRateByTrancheAndGrade = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { trancheId, salarygrade, stepincrement } = req.params;
    
    // Verify tranche exists
    const [trancheCheck] = await pool.execute(
      'SELECT tranche_id, implement_year FROM salarytranches WHERE tranche_id = ?',
      [trancheId]
    );
    
    if (trancheCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tranche not found'
      });
    }
    
    // Fetch specific rate with tranche_percent
    const query = `
      SELECT 
        r.rate_id,
        r.tranche_id,
        r.implement_year,
        r.salarygrade,
        r.stepincrement,
        r.rate,
        t.tranche_percent
      FROM salarytranches_rates r
      INNER JOIN salarytranches t ON r.tranche_id = t.tranche_id
      WHERE r.tranche_id = ? AND r.salarygrade = ? AND r.stepincrement = ?
    `;
    
    const [rates] = await pool.execute(query, [trancheId, salarygrade, stepincrement]);
    
    if (rates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rate not found for the specified tranche, salary grade, and step increment'
      });
    }
    
    res.json({
      success: true,
      data: rates[0]
    });
  } catch (error) {
    console.error('❌ Error fetching rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rate',
      error: error.message
    });
  }
};

// GET /api/201-plantilla-tranches/salary-classes - Get all salary classes
export const getSalaryClasses = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        id,
        classname,
        classtype,
        percentage
      FROM salaryclass
      WHERE percentage IS NOT NULL
      ORDER BY percentage DESC
    `;
    
    const [salaryClasses] = await pool.execute(query);
    
    res.json({
      success: true,
      data: salaryClasses
    });
  } catch (error) {
    console.error('❌ Error fetching salary classes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary classes',
      error: error.message
    });
  }
};

