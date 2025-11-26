// backend/controllers/employeeLeaveTypeController.js
import { getHR201Pool } from '../config/hr201Database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all leave types with question counts
 */
export const getAllLeaveTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        lt.*,
        COUNT(ltq.objid) as question_count
      FROM leavetypes lt
      LEFT JOIN leavetypes_question ltq ON lt.leaveid = ltq.leaveid
      GROUP BY lt.leaveid
      ORDER BY lt.leavecode ASC
    `;
    
    const [rows] = await pool.execute(query);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave types',
      error: error.message
    });
  }
};

/**
 * Get single leave type by ID with its questions
 */
export const getLeaveTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    // Get leave type details
    const [leaveTypeRows] = await pool.execute(
      'SELECT * FROM leavetypes WHERE leaveid = ?',
      [id]
    );
    
    if (leaveTypeRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave type not found'
      });
    }
    
    // Get questions for this leave type
    const [questionRows] = await pool.execute(
      'SELECT * FROM leavetypes_question WHERE leaveid = ? ORDER BY objid ASC',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        leaveType: leaveTypeRows[0],
        questions: questionRows
      }
    });
  } catch (error) {
    console.error('Error fetching leave type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave type',
      error: error.message
    });
  }
};

/**
 * Create new leave type
 */
export const createLeaveType = async (req, res) => {
  try {
    const {
      leavecode,
      leavetype,
      leavedescription,
      coverage,
      annualentitlement,
      accrual,
      cycle,
      isconverttocash,
      hasquestion
    } = req.body;
    
    // Validate required fields
    if (!leavecode || !leavetype) {
      return res.status(400).json({
        success: false,
        message: 'Leave code and leave type are required'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check for duplicate leave code
    const [existingRows] = await pool.execute(
      'SELECT leaveid FROM leavetypes WHERE leavecode = ?',
      [leavecode]
    );
    
    if (existingRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Leave code already exists'
      });
    }
    
    // Insert new leave type
    const insertQuery = `
      INSERT INTO leavetypes (
        leavecode, leavetype, leavedescription, coverage,
        annualentitlement, accrual, cycle, isconverttocash, hasquestion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.execute(insertQuery, [
      leavecode,
      leavetype,
      leavedescription || null,
      coverage || null,
      annualentitlement || null,
      accrual || null,
      cycle || null,
      isconverttocash ? 1 : 0,
      hasquestion ? 1 : 0
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Leave type created successfully',
      data: {
        leaveid: result.insertId,
        leavecode,
        leavetype
      }
    });
  } catch (error) {
    console.error('Error creating leave type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create leave type',
      error: error.message
    });
  }
};

/**
 * Update existing leave type
 */
export const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      leavecode,
      leavetype,
      leavedescription,
      coverage,
      annualentitlement,
      accrual,
      cycle,
      isconverttocash,
      hasquestion
    } = req.body;
    
    // Validate required fields
    if (!leavecode || !leavetype) {
      return res.status(400).json({
        success: false,
        message: 'Leave code and leave type are required'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check if leave type exists
    const [existingRows] = await pool.execute(
      'SELECT leaveid FROM leavetypes WHERE leaveid = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave type not found'
      });
    }
    
    // Check for duplicate leave code (excluding current record)
    const [duplicateRows] = await pool.execute(
      'SELECT leaveid FROM leavetypes WHERE leavecode = ? AND leaveid != ?',
      [leavecode, id]
    );
    
    if (duplicateRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Leave code already exists'
      });
    }
    
    // Update leave type
    const updateQuery = `
      UPDATE leavetypes SET
        leavecode = ?, leavetype = ?, leavedescription = ?, coverage = ?,
        annualentitlement = ?, accrual = ?, cycle = ?, isconverttocash = ?, hasquestion = ?
      WHERE leaveid = ?
    `;
    
    await pool.execute(updateQuery, [
      leavecode,
      leavetype,
      leavedescription || null,
      coverage || null,
      annualentitlement || null,
      accrual || null,
      cycle || null,
      isconverttocash ? 1 : 0,
      hasquestion ? 1 : 0,
      id
    ]);
    
    res.json({
      success: true,
      message: 'Leave type updated successfully'
    });
  } catch (error) {
    console.error('Error updating leave type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leave type',
      error: error.message
    });
  }
};

/**
 * Delete leave type and cascade delete questions
 */
export const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    // Check if leave type exists
    const [existingRows] = await pool.execute(
      'SELECT leaveid FROM leavetypes WHERE leaveid = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave type not found'
      });
    }
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Delete questions first (foreign key constraint)
      await connection.execute(
        'DELETE FROM leavetypes_question WHERE leaveid = ?',
        [id]
      );
      
      // Delete leave type
      await connection.execute(
        'DELETE FROM leavetypes WHERE leaveid = ?',
        [id]
      );
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Leave type deleted successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error deleting leave type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete leave type',
      error: error.message
    });
  }
};

/**
 * Get all questions for a specific leave type
 */
export const getQuestionsByLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    const [rows] = await pool.execute(
      'SELECT * FROM leavetypes_question WHERE leaveid = ? ORDER BY objid ASC',
      [id]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questions',
      error: error.message
    });
  }
};

/**
 * Add question to leave type
 */
export const addQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;
    
    if (!question || question.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Question text is required'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check if leave type exists
    const [existingRows] = await pool.execute(
      'SELECT leaveid FROM leavetypes WHERE leaveid = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave type not found'
      });
    }
    
    // Insert new question
    const insertQuery = `
      INSERT INTO leavetypes_question (objid, leaveid, question)
      VALUES (?, ?, ?)
    `;
    
    const objid = uuidv4();
    await pool.execute(insertQuery, [objid, id, question.trim()]);
    
    // Update hasquestion to 1 since we just added a question
    await pool.execute(
      'UPDATE leavetypes SET hasquestion = 1 WHERE leaveid = ?',
      [id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      data: {
        objid,
        leaveid: id,
        question: question.trim()
      }
    });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add question',
      error: error.message
    });
  }
};

/**
 * Update question text
 */
export const updateQuestion = async (req, res) => {
  try {
    const { objid } = req.params;
    const { question } = req.body;
    
    if (!question || question.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Question text is required'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check if question exists
    const [existingRows] = await pool.execute(
      'SELECT objid FROM leavetypes_question WHERE objid = ?',
      [objid]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Update question
    await pool.execute(
      'UPDATE leavetypes_question SET question = ? WHERE objid = ?',
      [question.trim(), objid]
    );
    
    res.json({
      success: true,
      message: 'Question updated successfully'
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update question',
      error: error.message
    });
  }
};

/**
 * Delete question
 */
export const deleteQuestion = async (req, res) => {
  try {
    const { objid } = req.params;
    const pool = getHR201Pool();
    
    // Check if question exists and get the leaveid
    const [existingRows] = await pool.execute(
      'SELECT objid, leaveid FROM leavetypes_question WHERE objid = ?',
      [objid]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    const leaveid = existingRows[0].leaveid;
    
    // Delete question
    await pool.execute(
      'DELETE FROM leavetypes_question WHERE objid = ?',
      [objid]
    );
    
    // Check if there are any remaining questions for this leave type
    const [remainingQuestions] = await pool.execute(
      'SELECT COUNT(*) as count FROM leavetypes_question WHERE leaveid = ?',
      [leaveid]
    );
    
    // Update hasquestion based on whether there are remaining questions
    const hasquestion = remainingQuestions[0].count > 0 ? 1 : 0;
    await pool.execute(
      'UPDATE leavetypes SET hasquestion = ? WHERE leaveid = ?',
      [hasquestion, leaveid]
    );
    
    res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete question',
      error: error.message
    });
  }
};
