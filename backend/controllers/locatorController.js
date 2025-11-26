import { getDb } from '../config/db.js';
import sql from 'mssql';
import { randomUUID } from 'crypto';

// GET /api/locator - Get all locator entries with filtering
export const getLocators = async (req, res) => {
  try {
    const pool = getDb();
    
    // Get search parameters from query string
    const { 
      employeeSearch, 
      locatorNoSearch, 
      dateFrom, 
      dateTo, 
      destinationSearch,
      purposeSearch,
      page = 1,
      pageSize = 10 
    } = req.query;
    
    // Check if LOCATOR2 table exists, create if not
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOCATOR2'
    `);
    
    if (tableCheck.recordset[0].tableExists === 0) {
      // Create the table with new schema including LOCATORUID if it doesn't exist
      await pool.request().query(`
        CREATE TABLE [dbo].[LOCATOR2](
          [LOCATORUID] [uniqueidentifier] NULL,
          [LOCNO] [nvarchar](15) NULL,
          [LOCUSERID] [int] NULL,
          [LOCDATE] [datetime] NULL,
          [LOCDESTINATION] [nvarchar](50) NULL,
          [LOCPURPOSE] [nvarchar](100) NULL,
          [LOCTIMEDEPARTURE] [nvarchar](10) NULL,
          [LOCTIMEARRIVAL] [nvarchar](10) NULL,
          [LOCREMARKS] [varchar](50) NULL,
          [LOCENTRYBY] [nvarchar](50) NULL,
          [LOCENTRYDATE] [datetime] NULL,
          [LOCSTATUS] [nvarchar](50) NULL
        ) ON [PRIMARY]
      `);
    }

    // Build the base query with LOCATORUID
    let query = `
      SELECT 
        l.LOCATORUID,
        l.LOCNO,
        l.LOCUSERID,
        l.LOCDATE,
        l.LOCDESTINATION,
        l.LOCPURPOSE,
        l.LOCTIMEDEPARTURE,
        l.LOCTIMEARRIVAL,
        l.LOCREMARKS,
        l.LOCENTRYBY,
        l.LOCENTRYDATE,
        l.LOCSTATUS,
        u.NAME,
        u.BADGENUMBER
      FROM LOCATOR2 l
      LEFT JOIN USERINFO u ON l.LOCUSERID = u.USERID
      WHERE 1=1
    `;

    // Add search conditions
    if (employeeSearch) {
      query += ` AND u.NAME LIKE '%${employeeSearch}%'`;
    }
    if (locatorNoSearch) {
      query += ` AND l.LOCNO LIKE '%${locatorNoSearch}%'`;
    }
    if (dateFrom) {
      query += ` AND l.LOCDATE >= '${dateFrom}'`;
    }
    if (dateTo) {
      query += ` AND l.LOCDATE <= '${dateTo}'`;
    }
    if (destinationSearch) {
      query += ` AND l.LOCDESTINATION LIKE '%${destinationSearch}%'`;
    }
    if (purposeSearch) {
      query += ` AND l.LOCPURPOSE LIKE '%${purposeSearch}%'`;
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.request().query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    // Build the paginated query with LOCATORUID
    let paginatedQuery = `
      SELECT * FROM (
        SELECT 
          l.LOCATORUID,
          l.LOCNO,
          l.LOCUSERID,
          l.LOCDATE,
          l.LOCDESTINATION,
          l.LOCPURPOSE,
          l.LOCTIMEDEPARTURE,
          l.LOCTIMEARRIVAL,
          l.LOCREMARKS,
          l.LOCENTRYBY,
          l.LOCENTRYDATE,
          l.LOCSTATUS,
          u.NAME,
          u.BADGENUMBER,
          ROW_NUMBER() OVER (ORDER BY l.LOCDATE DESC) as row_num
        FROM LOCATOR2 l
        LEFT JOIN USERINFO u ON l.LOCUSERID = u.USERID
        WHERE 1=1
    `;
    
    // Add the same search conditions to paginated query
    if (employeeSearch) {
      paginatedQuery += ` AND u.NAME LIKE '%${employeeSearch}%'`;
    }
    if (locatorNoSearch) {
      paginatedQuery += ` AND l.LOCNO LIKE '%${locatorNoSearch}%'`;
    }
    if (dateFrom) {
      paginatedQuery += ` AND l.LOCDATE >= '${dateFrom}'`;
    }
    if (dateTo) {
      paginatedQuery += ` AND l.LOCDATE <= '${dateTo}'`;
    }
    if (destinationSearch) {
      paginatedQuery += ` AND l.LOCDESTINATION LIKE '%${destinationSearch}%'`;
    }
    if (purposeSearch) {
      paginatedQuery += ` AND l.LOCPURPOSE LIKE '%${purposeSearch}%'`;
    }
    
    paginatedQuery += `
      ) as paginated
      WHERE row_num > ${offset} AND row_num <= ${offset + limit}
    `;

    const result = await pool.request().query(paginatedQuery);
    
    res.json({
      success: true,
      data: result.recordset,
      pagination: {
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
        totalRecords,
      totalPages: Math.ceil(totalRecords / parseInt(pageSize))
      }
    });

  } catch (error) {
    console.error('Error fetching locators:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching locator entries',
      error: error.message
    });
  }
};

// POST /api/locator - Create new locator entry
export const addLocator = async (req, res) => {
  try {
    console.log('=== addLocator DEBUG START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      LOCNO,
      LOCUSERID,
      LOCDATE,
      LOCDESTINATION,
      LOCPURPOSE,
      LOCTIMEDEPARTURE,
      LOCTIMEARRIVAL,
      LOCREMARKS,
      LOCENTRYBY,
      LOCSTATUS
    } = req.body;

    // Generate a unique identifier for LOCATORUID
    const locatorUid = randomUUID();

    // UPDATED: Generate LOCNO in format: YYMMDD+LE(prefix)+001(Seqno) (e.g., 250917LE-001)
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Create prefix in format YYMMDD
    const datePrefix = `${year}${month}${day}`;
    
    // Get count of locator records for today to generate sequence number
    const pool = getDb(); // Re-declare pool to avoid closure issues
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM LOCATOR2 
      WHERE YEAR(LOCENTRYDATE) = ${now.getFullYear()} 
      AND MONTH(LOCENTRYDATE) = ${now.getMonth() + 1} 
      AND DAY(LOCENTRYDATE) = ${now.getDate()}
    `;
    const countResult = await pool.request().query(countQuery);
    const sequenceNumber = String((countResult.recordset[0].count || 0) + 1).padStart(3, '0');
    
    // Create final reference number: YYMMDD+LE(prefix)+001(Seqno)
    const locatorNo = `${datePrefix}LE-${sequenceNumber}`;
    
    console.log('Generated Locator No:', locatorNo);

    console.log('Extracted data:', {
      LOCATORUID: locatorUid,
      LOCNO: locatorNo, // Use generated locator number
      LOCUSERID,
      LOCDATE,
      LOCDESTINATION,
      LOCPURPOSE,
      LOCTIMEDEPARTURE,
      LOCTIMEARRIVAL,
      LOCREMARKS,
      LOCENTRYBY,
      LOCSTATUS
    });

    // Check if LOCATOR2 table exists, create if not
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOCATOR2'
    `);
    
    if (tableCheck.recordset[0].tableExists === 0) {
      console.log('Creating LOCATOR2 table...');
      // Create the table with new schema including LOCATORUID
      await pool.request().query(`
        CREATE TABLE [dbo].[LOCATOR2](
          [LOCATORUID] [uniqueidentifier] NULL,
          [LOCNO] [nvarchar](15) NULL,
          [LOCUSERID] [int] NULL,
          [LOCDATE] [datetime] NULL,
          [LOCDESTINATION] [nvarchar](50) NULL,
          [LOCPURPOSE] [nvarchar](100) NULL,
          [LOCTIMEDEPARTURE] [nvarchar](10) NULL,
          [LOCTIMEARRIVAL] [nvarchar](10) NULL,
          [LOCREMARKS] [varchar](50) NULL,
          [LOCENTRYBY] [nvarchar](50) NULL,
          [LOCENTRYDATE] [datetime] NULL,
          [LOCSTATUS] [nvarchar](50) NULL
        ) ON [PRIMARY]
      `);
      console.log('LOCATOR2 table created successfully');
    }

    console.log('About to insert into LOCATOR2 with LOCATORUID');

    // Insert into LOCATOR2 table with LOCATORUID
    const insertQuery = `
      INSERT INTO LOCATOR2 (
        LOCATORUID, LOCNO, LOCUSERID, LOCDATE, LOCDESTINATION, LOCPURPOSE, 
        LOCTIMEDEPARTURE, LOCTIMEARRIVAL, LOCREMARKS, LOCENTRYBY, LOCENTRYDATE, LOCSTATUS
      ) VALUES (
        @LOCATORUID, @LOCNO, @LOCUSERID, @LOCDATE, @LOCDESTINATION, @LOCPURPOSE, 
        @LOCTIMEDEPARTURE, @LOCTIMEARRIVAL, @LOCREMARKS, @LOCENTRYBY, GETDATE(), @LOCSTATUS
      )
    `;
    
    console.log('Executing LOCATOR2 insert query...');
    await pool.request()
      .input('LOCATORUID', sql.UniqueIdentifier, locatorUid)
      .input('LOCNO', sql.NVarChar(15), locatorNo) // Use generated locator number
      .input('LOCUSERID', sql.Int, LOCUSERID)
      .input('LOCDATE', sql.DateTime, LOCDATE) // Convert to DateTime
      .input('LOCDESTINATION', sql.NVarChar(50), LOCDESTINATION || null)
      .input('LOCPURPOSE', sql.NVarChar(100), LOCPURPOSE || null)
      .input('LOCTIMEDEPARTURE', sql.NVarChar(10), LOCTIMEDEPARTURE || null) // Store as string
      .input('LOCTIMEARRIVAL', sql.NVarChar(10), LOCTIMEARRIVAL || null) // Store as string
      .input('LOCREMARKS', sql.VarChar(50), LOCREMARKS || null)
      .input('LOCENTRYBY', sql.NVarChar(50), LOCENTRYBY || null)
      .input('LOCSTATUS', sql.NVarChar(50), LOCSTATUS || 'ACTIVE')
      .query(insertQuery);

    console.log('Successfully inserted into LOCATOR2 with LOCATORUID:', locatorUid);

    // Old SHIFTSCHEDULE2 table removed - shift schedule data now comes from shiftscheduletypes
    // For now, skip shift time validation as it requires migration to new system
    console.log('⚠️ Shift schedule check skipped - old SHIFTSCHEDULE2 table removed');
    const shiftTimes = [
      { name: 'AM_CHECKIN', time: null },
      { name: 'AM_CHECKOUT', time: null },
      { name: 'PM_CHECKIN', time: null },
      { name: 'PM_CHECKOUT', time: null }
    ];

    console.log('Shift times to check:', shiftTimes);

    // Check if departure and arrival times are provided
    if (!LOCTIMEDEPARTURE || !LOCTIMEARRIVAL) {
      console.log('No departure/arrival times provided, skipping CHECKINOUT insertion');
      return res.status(201).json({ message: 'Locator entry created successfully (no time range provided)' });
    }

    // Parse departure and arrival times - PRESERVE ORIGINAL VALUES, NO CONVERSION
    const departureTime = LOCTIMEDEPARTURE; // Use as-is, no Date conversion
    const arrivalTime = LOCTIMEARRIVAL; // Use as-is, no Date conversion

    console.log('Time range (preserved):', { departureTime, arrivalTime });

    // Check each shift time and insert into CHECKINOUT if within range
    for (const shiftTime of shiftTimes) {
      if (!shiftTime.time) {
        console.log(`Skipping ${shiftTime.name} - no time value`);
        continue;
      }

      try {
        // Extract time directly from the shift schedule WITHOUT any conversion
        // shiftTime.time is already a Date object from the database
        // Use toISOString() to preserve UTC time, not toString() which converts to local timezone
        const timeMatch = shiftTime.time.toISOString().match(/T(\d{2}:\d{2}:\d{2})/);
        if (!timeMatch) {
          console.log(`Skipping ${shiftTime.name} - could not extract time from: ${shiftTime.time}`);
          continue;
        }
        
        const timeOnly = timeMatch[1]; // Extract HH:MM:SS directly
        const timeOnlyHHMM = timeOnly.substring(0, 5); // Extract HH:MM for comparison
        
        console.log(`Checking ${shiftTime.name}:`);
        console.log(`  Original shift time: ${shiftTime.time}`);
        console.log(`  Original shift time ISO: ${shiftTime.time.toISOString()}`);
        console.log(`  Time portion only: ${timeOnly}`);
        console.log(`  Time portion HH:MM: ${timeOnlyHHMM}`);
        console.log(`  Departure time: ${departureTime}`);
        console.log(`  Arrival time: ${arrivalTime}`);
        console.log(`  Is ${timeOnlyHHMM} >= ${departureTime}? ${timeOnlyHHMM >= departureTime}`);
        console.log(`  Is ${timeOnlyHHMM} <= ${arrivalTime}? ${timeOnlyHHMM <= arrivalTime}`);

        // Check if shift time falls within departure-arrival range (time-only comparison)
        if (timeOnlyHHMM >= departureTime && timeOnlyHHMM <= arrivalTime) {
          console.log(`✅ ${shiftTime.name} falls within range, checking for existing logs in specific time window`);

          // Old SHIFTSCHEDULE2 table removed - shift schedule data now comes from shiftscheduletypes
          // Skip shift range validation as it requires migration to new system
          console.log(`⚠️ Shift schedule range check skipped for employee ${LOCUSERID} - old table removed`);
          const shiftRanges = {
            SHIFT_AMCHECKIN: null,
            SHIFT_AMCHECKOUT: null,
            SHIFT_PMCHECKIN: null,
            SHIFT_PMCHECKOUT: null,
            SHIFT_AMCHECKIN_START: null,
            SHIFT_AMCHECKIN_END: null,
            SHIFT_AMCHECKOUT_START: null,
            SHIFT_AMCHECKOUT_END: null,
            SHIFT_PMCHECKIN_START: null,
            SHIFT_PMCHECKIN_END: null,
            SHIFT_PMCHECKOUT_START: null,
            SHIFT_PMCHECKOUT_END: null
          };
          console.log('Shift schedule ranges:', shiftRanges);

          // Extract time portions from the shift schedule ranges
          const extractTimeFromDate = (dateObj) => {
            if (!dateObj) return null;
            // Convert to UTC string and extract time portion
            const utcStr = new Date(dateObj).toISOString();
            return utcStr.match(/T(\d{2}:\d{2}:\d{2})/)[1];
          };

          const amCheckInStart = extractTimeFromDate(shiftRanges.SHIFT_AMCHECKIN_START);
          const amCheckInEnd = extractTimeFromDate(shiftRanges.SHIFT_AMCHECKIN_END);
          const amCheckOutStart = extractTimeFromDate(shiftRanges.SHIFT_AMCHECKOUT_START);
          const amCheckOutEnd = extractTimeFromDate(shiftRanges.SHIFT_AMCHECKOUT_END);
          const pmCheckInStart = extractTimeFromDate(shiftRanges.SHIFT_PMCHECKIN_START);
          const pmCheckInEnd = extractTimeFromDate(shiftRanges.SHIFT_PMCHECKIN_END);
          const pmCheckOutStart = extractTimeFromDate(shiftRanges.SHIFT_PMCHECKOUT_START);
          const pmCheckOutEnd = extractTimeFromDate(shiftRanges.SHIFT_PMCHECKOUT_END);

          console.log('Extracted time portions:', {
            amCheckInStart, amCheckInEnd,
            amCheckOutStart, amCheckOutEnd,
            pmCheckInStart, pmCheckInEnd,
            pmCheckOutStart, pmCheckOutEnd
          });

          // Get the actual shift time for this specific shift time name - NO CONVERSION
          let actualShiftTime = null;
          let windowStart = null;
          let windowEnd = null;

          if (shiftTime.name === 'AM_CHECKIN') {
            actualShiftTime = shiftRanges.SHIFT_AMCHECKIN;
            windowStart = amCheckInStart;
            windowEnd = amCheckInEnd;
          } else if (shiftTime.name === 'AM_CHECKOUT') {
            actualShiftTime = shiftRanges.SHIFT_AMCHECKOUT;
            windowStart = amCheckOutStart;
            windowEnd = amCheckOutEnd;
          } else if (shiftTime.name === 'PM_CHECKIN') {
            actualShiftTime = shiftRanges.SHIFT_PMCHECKIN;
            windowStart = pmCheckInStart;
            windowEnd = pmCheckInEnd;
          } else if (shiftTime.name === 'PM_CHECKOUT') {
            actualShiftTime = shiftRanges.SHIFT_PMCHECKOUT;
            windowStart = pmCheckOutStart;
            windowEnd = pmCheckOutEnd;
          }

          console.log(`🔍 ${shiftTime.name} details:`, {
            actualShiftTime,
            windowStart,
            windowEnd
          });

          // Check if actualShiftTime is null
          if (!actualShiftTime) {
            console.log(`⚠️ No actual shift time found for ${shiftTime.name}, skipping`);
            continue;
          }

          // Extract time from the actual shift time - DIRECT STRING EXTRACTION
          // Use toISOString() to preserve UTC time, not toString() which converts to local timezone
          const actualTimeMatch = actualShiftTime.toISOString().match(/T(\d{2}:\d{2}:\d{2})/);
          if (!actualTimeMatch) {
            console.log(`⚠️ Could not extract time from actual shift time: ${actualShiftTime}, skipping`);
            continue;
          }
          
          const actualTimeStr = actualTimeMatch[1];

          // Create CHECKTIME by combining LOCDATE (date) + shift schedule time
          // Extract date from LOCDATE (format: YYYY-MM-DD)
          const dateStr = LOCDATE.split('T')[0]; // Get just the date part
          
          // Combine LOCDATE date with the shift schedule time
          const checkTimeString = `${dateStr} ${actualTimeStr}`;
          
          console.log(`🔍 DEBUG INSERTION DETAILS:`);
          console.log(`  - LOCDATE: ${LOCDATE}`);
          console.log(`  - Date string: ${dateStr}`);
          console.log(`  - Actual shift time: ${actualTimeStr}`);
          console.log(`  - Combined checkTime string: ${checkTimeString}`);

          // Check for existing logs with the EXACT same timestamp
          const exactTimestampQuery = `
            SELECT COUNT(*) as count
            FROM CHECKINOUT
            WHERE USERID = @USERID 
              AND CHECKTIME = @EXACTCHECKTIME
          `;

          console.log(`🔍 Checking for exact timestamp: USERID=${LOCUSERID}, CHECKTIME=${checkTimeString}`);

          const exactTimestampResult = await pool.request()
            .input('USERID', sql.Int, LOCUSERID)
            .input('EXACTCHECKTIME', sql.NVarChar, checkTimeString) // Use NVarChar to pass as string
            .query(exactTimestampQuery);

          const exactTimestampCount = exactTimestampResult.recordset[0].count;
          console.log(`Existing logs with exact timestamp: ${exactTimestampCount}`);

          if (exactTimestampCount === 0) {
            console.log(`✅ No existing logs found with exact timestamp, inserting new record`);

            // Insert new record into CHECKINOUT - Use LOCDATE + actual shift schedule time
            const checkinoutInsertQuery = `
              INSERT INTO CHECKINOUT (USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, Memoinfo, WorkCode, sn, UserExtFmt)
              VALUES (@USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID, @Memoinfo, @WorkCode, @sn, @UserExtFmt)
            `;

            console.log(`📝 INSERT QUERY: ${checkinoutInsertQuery}`);
            console.log(`📝 INSERT PARAMETERS:`);
            console.log(`  - USERID: ${LOCUSERID}`);
            console.log(`  - CHECKTIME: ${checkTimeString}`);
            console.log(`  - CHECKTYPE: I`);
            console.log(`  - VERIFYCODE: 1`);
            console.log(`  - SENSORID: 101`);
            console.log(`  - Memoinfo: null`);
            console.log(`  - WorkCode: 0`);
            console.log(`  - sn: CLXE224760198`);
            console.log(`  - UserExtFmt: 0`);

            try {
            const insertResult = await pool.request()
              .input('USERID', sql.Int, LOCUSERID)
                .input('CHECKTIME', sql.NVarChar, checkTimeString) // Use NVarChar to pass as string
              .input('CHECKTYPE', sql.VarChar(1), 'I') // Default check type
              .input('VERIFYCODE', sql.Int, 1) // Default verify code
              .input('SENSORID', sql.VarChar(5), '101') // Default sensor ID
              .input('Memoinfo', sql.VarChar(30), null) // Default memo info
              .input('WorkCode', sql.VarChar(24), '0') // Default work code
              .input('sn', sql.VarChar(20), 'CLXE224760198') // Default SN
              .input('UserExtFmt', sql.SmallInt, 0) // Default user ext format
              .query(checkinoutInsertQuery);

              console.log(`✅ INSERT RESULT:`, insertResult);
              console.log(`✅ Successfully inserted ${shiftTime.name} record`);
              
              // Verify the insertion by checking if the record exists
              const verifyQuery = `
                SELECT TOP 1 USERID, CHECKTIME, CHECKTYPE 
                FROM CHECKINOUT 
                WHERE USERID = @USERID 
                  AND CHECKTIME = @EXACTCHECKTIME
                ORDER BY CHECKTIME DESC
              `;
              
              const verifyResult = await pool.request()
                .input('USERID', sql.Int, LOCUSERID)
                .input('EXACTCHECKTIME', sql.NVarChar, checkTimeString)
                .query(verifyQuery);
              
              console.log(`🔍 VERIFICATION RESULT:`, verifyResult.recordset);
              
            } catch (insertError) {
              console.error(`❌ INSERT ERROR for ${shiftTime.name}:`, insertError);
              console.error(`❌ INSERT ERROR DETAILS:`, {
                message: insertError.message,
                code: insertError.code,
                number: insertError.number,
                lineNumber: insertError.lineNumber
              });
            }
          } else {
            console.log(`⚠️ Employee already has a log with exact timestamp ${checkTimeString}, skipping ${shiftTime.name} insertion`);
            
            // DEBUG: Get details of the existing log
            const existingLogQuery = `
              SELECT TOP 1 USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, Memoinfo, WorkCode, sn, UserExtFmt
              FROM CHECKINOUT
              WHERE USERID = @USERID 
                AND CHECKTIME = @EXACTCHECKTIME
              ORDER BY CHECKTIME DESC
            `;

            const existingLogResult = await pool.request()
              .input('USERID', sql.Int, LOCUSERID)
              .input('EXACTCHECKTIME', sql.NVarChar, checkTimeString)
              .query(existingLogQuery);

            if (existingLogResult.recordset.length > 0) {
              const existingLog = existingLogResult.recordset[0];
              console.log(`🔍 EXISTING LOG DETAILS:`);
              console.log(`  - USERID: ${existingLog.USERID}`);
              console.log(`  - CHECKTIME: ${existingLog.CHECKTIME}`);
              console.log(`  - CHECKTYPE: ${existingLog.CHECKTYPE}`);
              console.log(`  - VERIFYCODE: ${existingLog.VERIFYCODE}`);
              console.log(`  - SENSORID: ${existingLog.SENSORID}`);
              console.log(`  - Memoinfo: ${existingLog.Memoinfo}`);
              console.log(`  - WorkCode: ${existingLog.WorkCode}`);
              console.log(`  - sn: ${existingLog.sn}`);
              console.log(`  - UserExtFmt: ${existingLog.UserExtFmt}`);
              
              // Also check if this log was created by a previous locator entry
              console.log(`🔍 CHECKING IF THIS IS A LOCATOR-GENERATED LOG:`);
              if (existingLog.SENSORID === '101' && existingLog.sn === 'CLXE224760198') {
                console.log(`  ✅ This appears to be a locator-generated log (SENSORID=101, sn=CLXE224760198)`);
              } else {
                console.log(`  ❌ This appears to be a regular time log (not locator-generated)`);
              }
            } else {
              console.log(`🔍 No existing log details found (unexpected)`);
            }
          }
        } else {
          console.log(`❌ ${shiftTime.name} does not fall within range`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${shiftTime.name}:`, error);
        console.error(`❌ Error details:`, {
          message: error.message,
          code: error.code,
          number: error.number,
          lineNumber: error.lineNumber
        });
      }
    }

    console.log('=== addLocator DEBUG END ===');
    res.status(201).json({ 
      success: true,
      message: 'Locator entry created successfully',
      locatorUid: locatorUid,
      locatorNo: locatorNo
    });

  } catch (error) {
    console.error('=== addLocator ERROR ===');
    console.error('Error creating locator entry:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      number: error.number,
      state: error.state,
      class: error.class,
      serverName: error.serverName,
      procName: error.procName,
      lineNumber: error.lineNumber
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Error creating locator entry',
      error: error.message 
    });
  }
};

// Update locator entry
export const updateLocator = async (req, res) => {
  try {
    const { locNo } = req.params;
    const {
      LOCUSERID,
      LOCDATE,
      LOCDESTINATION,
      LOCPURPOSE,
      LOCTIMEDEPARTURE,
      LOCTIMEARRIVAL,
      LOCREMARKS,
      LOCENTRYBY,
      LOCSTATUS
    } = req.body;

    const pool = getDb();
    
    const updateQuery = `
      UPDATE LOCATOR2 
      SET LOCUSERID = @LOCUSERID,
          LOCDATE = @LOCDATE,
          LOCDESTINATION = @LOCDESTINATION,
          LOCPURPOSE = @LOCPURPOSE,
          LOCTIMEDEPARTURE = @LOCTIMEDEPARTURE,
          LOCTIMEARRIVAL = @LOCTIMEARRIVAL,
          LOCREMARKS = @LOCREMARKS,
          LOCENTRYBY = @LOCENTRYBY,
          LOCSTATUS = @LOCSTATUS
      WHERE LOCNO = @LOCNO
    `;

    await pool.request()
      .input('LOCNO', sql.NVarChar(15), locNo)
      .input('LOCUSERID', sql.Int, LOCUSERID)
      .input('LOCDATE', sql.DateTime, LOCDATE)
      .input('LOCDESTINATION', sql.NVarChar(50), LOCDESTINATION || null)
      .input('LOCPURPOSE', sql.NVarChar(100), LOCPURPOSE || null)
      .input('LOCTIMEDEPARTURE', sql.NVarChar(10), LOCTIMEDEPARTURE || null)
      .input('LOCTIMEARRIVAL', sql.NVarChar(10), LOCTIMEARRIVAL || null)
      .input('LOCREMARKS', sql.VarChar(50), LOCREMARKS || null)
      .input('LOCENTRYBY', sql.NVarChar(50), LOCENTRYBY || null)
      .input('LOCSTATUS', sql.NVarChar(50), LOCSTATUS || 'ACTIVE')
      .query(updateQuery);

    res.json({ success: true, message: 'Locator entry updated successfully' });
  } catch (error) {
    console.error('Error updating locator entry:', error);
    res.status(500).json({ success: false, message: 'Error updating locator entry', error: error.message });
  }
};

// Delete locator entry
export const deleteLocator = async (req, res) => {
  try {
    const { locNo } = req.params;
    const pool = getDb();
    
    const deleteQuery = `DELETE FROM LOCATOR2 WHERE LOCNO = @LOCNO`;
    
    await pool.request()
      .input('LOCNO', sql.NVarChar(15), locNo)
      .query(deleteQuery);

    res.json({ success: true, message: 'Locator entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting locator entry:', error);
    res.status(500).json({ success: false, message: 'Error deleting locator entry', error: error.message });
  }
};

// Get locator by ID
export const getLocatorById = async (req, res) => {
  try {
    const { locNo } = req.params;
    const pool = getDb();
    
    const query = `
      SELECT l.*, u.NAME, u.BADGENUMBER
      FROM LOCATOR2 l
      LEFT JOIN USERINFO u ON l.LOCUSERID = u.USERID
      WHERE l.LOCNO = @LOCNO
    `;
    
    const result = await pool.request()
      .input('LOCNO', sql.NVarChar(15), locNo)
      .query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Locator entry not found' });
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error fetching locator entry:', error);
    res.status(500).json({ success: false, message: 'Error fetching locator entry', error: error.message });
  }
};

// Get locator count
export const getLocatorCount = async (req, res) => {
  try {
    const pool = getDb();
    
    const query = `SELECT COUNT(*) as count FROM LOCATOR2`;
    const result = await pool.request().query(query);
    
    res.json({ success: true, count: result.recordset[0].count });
  } catch (error) {
    console.error('Error fetching locator count:', error);
    res.status(500).json({ success: false, message: 'Error fetching locator count', error: error.message });
  }
};

// Check for duplicate locator entries
export const checkDuplicateLocator = async (req, res) => {
  try {
    const { userId, locDate } = req.query;
    const pool = getDb();
    
    const query = `
      SELECT COUNT(*) as count 
      FROM LOCATOR2 
      WHERE LOCUSERID = @USERID AND LOCDATE = @LOCDATE
    `;
    
    const result = await pool.request()
      .input('USERID', sql.Int, userId)
      .input('LOCDATE', sql.DateTime, locDate)
      .query(query);
    
    const hasDuplicate = result.recordset[0].count > 0;
    
    res.json({ 
      success: true, 
      hasDuplicate,
      count: result.recordset[0].count 
    });
  } catch (error) {
    console.error('Error checking duplicate locator:', error);
    res.status(500).json({ success: false, message: 'Error checking duplicate locator', error: error.message });
  }
};

// Get monthly locator statistics
export const getMonthlyLocatorStats = async (req, res) => {
  try {
    const pool = getDb();
    
    const query = `
      SELECT 
        YEAR(LOCDATE) as year,
        MONTH(LOCDATE) as month,
        COUNT(*) as count
      FROM LOCATOR2 
      WHERE LOCDATE >= DATEADD(month, -12, GETDATE())
      GROUP BY YEAR(LOCDATE), MONTH(LOCDATE)
      ORDER BY year DESC, month DESC
    `;
    
    const result = await pool.request().query(query);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching monthly locator stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching monthly locator stats', error: error.message });
  }
};