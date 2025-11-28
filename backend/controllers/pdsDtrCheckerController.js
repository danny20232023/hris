import { getHR201Pool } from '../config/hr201Database.js';
import { getDb } from '../config/db.js';
import sql from 'mssql';
import { saveMediaFile, deleteMediaFile, readMediaAsBase64, fileExists } from '../utils/fileStorage.js';
import { v4 as uuidv4 } from 'uuid';

// GET /api/pds-dtrchecker/me - Get PDS data for logged-in user
export const getPDSForCurrentUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    // Extract user ID from auth middleware - JWT contains USERID field
    const userId = req.user.USERID;
    
    console.log(`🔍 [PdsDtrChecker] Fetching PDS for user ID: ${userId}`);
    console.log(`🔍 [PdsDtrChecker] Full user object:`, req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in authentication context'
      });
    }
    
    // Add timeout and connection optimization
    const connection = await pool.getConnection();
    connection.config.connectTimeout = 5000;
    
    try {
      // Fetch authoritative BADGENUMBER from MSSQL USERINFO by USERID
      let msBadge = null;
      try {
        const mssqlPool = getDb();
        const rs = await mssqlPool.request().input('uid', sql.Int, Number(userId)).query('SELECT BADGENUMBER FROM USERINFO WHERE USERID = @uid');
        if (rs.recordset && rs.recordset.length > 0) {
          msBadge = rs.recordset[0].BADGENUMBER ? String(rs.recordset[0].BADGENUMBER) : null;
        }
      } catch (e) {
        console.warn('⚠️ Unable to fetch BADGENUMBER from MSSQL USERINFO:', e.message);
      }
      // Get main employee data by dtruserid (normalize for string/padded columns)
      const [employees] = await connection.execute(
        'SELECT * FROM employees WHERE TRIM(CAST(dtruserid AS CHAR)) = ? LIMIT 1',
        [String(userId)]
      );
      
      if (employees.length === 0) {
        connection.release();
        return res.status(404).json({
          success: false,
          message: 'PDS record not found'
        });
      }
      
      const employee = employees[0];
      console.log(`✅ [PdsDtrChecker] Found employee: ${employee.surname}, ${employee.firstname}`);
      console.log(`🔍 [PdsDtrChecker] Employee objid: ${employee.objid}`);
      console.log(`🔍 [PdsDtrChecker] Employee dtruserid: ${employee.dtruserid}`);
      
      // Fetch all related PDS data (same structure as getPDS)
      const [addresses] = await connection.execute(
        'SELECT * FROM employee_address WHERE emp_objid = ?',
        [employee.objid]
      );
      
      // Map address fields to frontend field names and merge into employee object
      if (addresses.length > 0) {
        const address = addresses[0];
        employee.residential_province = address.resi_province || '';
        employee.residential_city_municipality = address.resi_city || '';
        employee.residential_barangay = address.resi_barangay || '';
        employee.residential_zip_code = address.resi_zip || '';
        employee.residential_subdivision_village = address.resi_village || '';
        employee.residential_street = address.resi_street || '';
        employee.residential_house_block_lot = address.resi_house || '';
        
        employee.permanent_province = address.perma_province || '';
        employee.permanent_city_municipality = address.perma_city || '';
        employee.permanent_barangay = address.perma_barangay || '';
        employee.permanent_zip_code = address.perma_zip || '';
        employee.permanent_subdivision_village = address.perma_village || '';
        employee.permanent_street = address.perma_street || '';
        employee.permanent_house_block_lot = address.perma_house || '';
      }
      
      const [childrenResult] = await connection.execute(
        'SELECT * FROM employee_childrens WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      const children = childrenResult.map(child => {
        let formattedDate = '';
        if (child.dateofbirth) {
          try {
            // Handle different date formats from database
            const date = new Date(child.dateofbirth);
            if (!isNaN(date.getTime())) {
              formattedDate = date.toISOString().split('T')[0];
            }
          } catch (error) {
            console.log(`⚠️ Error formatting date for child ${child.name}: ${child.dateofbirth}`);
          }
        }
        console.log(`📅 Child ${child.name}: dateofbirth=${child.dateofbirth} -> formatted=${formattedDate}`);
        return {
          full_name: child.name || '',
          date_of_birth: formattedDate
        };
      });
      
      const [education] = await connection.execute(
        'SELECT * FROM employee_education WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      
      const [eligibility] = await connection.execute(
        `SELECT 
          e.objid, e.emp_objid,
          et.careertypes as eligibility_type,
          e.rating,
          CASE WHEN e.date_of_exam IS NULL THEN NULL ELSE DATE_FORMAT(e.date_of_exam, '%Y-%m-%d') END as date_of_examination,
          e.place_of_exam as place_of_examination,
          e.license_number,
          CASE WHEN e.license_validity IS NULL THEN NULL ELSE DATE_FORMAT(e.license_validity, '%Y-%m-%d') END as date_of_validity
        FROM employee_eligibility e
        LEFT JOIN eligibilitytypes et ON e.career_service = et.id
        WHERE e.emp_objid = ? ORDER BY e.objid ASC`,
        [employee.objid]
      );
      
      console.log(`📋 [PdsDtrChecker] Found ${eligibility.length} eligibility records`);
      if (eligibility.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample eligibility record:', eligibility[0]);
      }
      
      const [spouse] = await connection.execute(
        'SELECT * FROM employee_spouses WHERE emp_objid = ?',
        [employee.objid]
      );
      
      // Map spouse fields to frontend field names and merge into employee object
      if (spouse.length > 0) {
        const spouseData = spouse[0];
        employee.spouse_surname = spouseData.spouse_surname || '';
        employee.spouse_firstname = spouseData.spouse_firstname || '';
        employee.spouse_middlename = spouseData.spouse_middlename || '';
        employee.spouse_extension = spouseData.spouse_extension || '';
        employee.spouse_occupation = spouseData.spouse_occupation || '';
        employee.spouse_employer_business_name = spouseData.employer_businessname || '';
        employee.spouse_business_address = spouseData.business_address || '';
        employee.spouse_telephone = spouseData.telephone_no || '';
      }
      
      const [workExperience] = await connection.execute(
        `SELECT 
          objid,
          emp_objid,
          CASE WHEN \`from\` IS NULL THEN NULL ELSE DATE_FORMAT(\`from\`, '%Y-%m-%d') END as date_from,
          CASE WHEN \`to\` IS NULL THEN NULL ELSE DATE_FORMAT(\`to\`, '%Y-%m-%d') END as date_to,
          position as position_title,
          department_name as department_agency_company,
          monthly_salary,
          pay_grade as salary_grade_step,
          appointment_status as status_of_appointment,
          gov_service as government_service,
          ispresent as is_present
        FROM employee_workexperience 
        WHERE emp_objid = ? 
        ORDER BY 
          CASE WHEN ispresent = 1 THEN 0 ELSE 1 END,
          \`from\` DESC`,
        [employee.objid]
      );
      
      console.log(`📋 [PdsDtrChecker] Found ${workExperience.length} work experience records`);
      if (workExperience.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample work experience record:', workExperience[0]);
      }
      
      const [voluntaryWork] = await connection.execute(
        'SELECT * FROM employee_voluntary WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      console.log(`📋 [PdsDtrChecker] Found ${voluntaryWork.length} voluntary work records`);
      if (voluntaryWork.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample voluntary work record:', voluntaryWork[0]);
        console.log('📋 [PdsDtrChecker] Voluntary work record keys:', Object.keys(voluntaryWork[0]));
        
        // Map database field names to frontend field names
        const mappedVoluntaryWork = voluntaryWork.map(work => ({
          organization_name_address: work.org_address || '',
          date_from: work.from || '',
          date_to: work.to || '',
          number_of_hours: work.num_of_hours || '',
          position_nature_of_work: work.position_of_work || ''
        }));
        console.log('📋 [PdsDtrChecker] Mapped voluntary work:', mappedVoluntaryWork);
        voluntaryWork.splice(0, voluntaryWork.length, ...mappedVoluntaryWork);
      }
      
      const [trainings] = await connection.execute(
        'SELECT * FROM employee_training WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      console.log(`📋 [PdsDtrChecker] Found ${trainings.length} training records`);
      if (trainings.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample training record:', trainings[0]);
        console.log('📋 [PdsDtrChecker] Training record keys:', Object.keys(trainings[0]));
        console.log('📋 [PdsDtrChecker] All field values in training record:');
        Object.keys(trainings[0]).forEach(key => {
          console.log(`  ${key}: "${trainings[0][key]}"`);
        });
        
        // Map database field names to frontend field names
        const mappedTrainings = trainings.map(training => ({
          training_title: training.title || '',
          date_from: training.from || '',
          date_to: training.to || '',
          number_of_hours: training.num_of_hours || '',
          type_of_ld: training.type || '',
          conducted_sponsored_by: training.conducted || ''
        }));
        console.log('📋 [PdsDtrChecker] Mapped trainings:', mappedTrainings);
        console.log('📋 [PdsDtrChecker] Sample mapped training conducted_sponsored_by:', mappedTrainings[0]?.conducted_sponsored_by);
        console.log('📋 [PdsDtrChecker] Raw conducted value:', trainings[0]?.conducted);
        trainings.splice(0, trainings.length, ...mappedTrainings);
      }
      
      const [skills] = await connection.execute(
        'SELECT * FROM employee_other_info_hobies WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      console.log(`📋 [PdsDtrChecker] Found ${skills.length} skills records`);
      if (skills.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample skills record:', skills[0]);
        console.log('📋 [PdsDtrChecker] Skills record keys:', Object.keys(skills[0]));
        
        // Map database field names to frontend field names
        const mappedSkills = skills.map(skill => ({
          skill_hobby: skill.skills_hobbies || skill.skill_hobby || skill.skill || skill.hobby || skill.description || ''
        }));
        console.log('📋 [PdsDtrChecker] Mapped skills:', mappedSkills);
        skills.splice(0, skills.length, ...mappedSkills);
      }
      
      const [recognitions] = await connection.execute(
        'SELECT * FROM employee_other_info_recognition WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      
      const [memberships] = await connection.execute(
        'SELECT * FROM employee_other_info_membership WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      console.log(`📋 [PdsDtrChecker] Found ${memberships.length} membership records`);
      if (memberships.length > 0) {
        console.log('📋 [PdsDtrChecker] Sample membership record:', memberships[0]);
        console.log('📋 [PdsDtrChecker] Membership record keys:', Object.keys(memberships[0]));
        
        // Map database field names to frontend field names
        const mappedMemberships = memberships.map(member => ({
          organization: member.membership || ''
        }));
        console.log('📋 [PdsDtrChecker] Mapped memberships:', mappedMemberships);
        memberships.splice(0, memberships.length, ...mappedMemberships);
      }
      
      const [references] = await connection.execute(
        'SELECT * FROM employee_references WHERE emp_objid = ? ORDER BY objid ASC',
        [employee.objid]
      );
      
      // Map references data to match frontend field names
      const mappedReferences = references.map(ref => ({
        reference_name: ref.reference_name || '',
        reference_address: ref.reference_address || '',
        reference_tel_no: ref.reference_phone || ref.reference_tel_no || ''
      }));
      
      console.log('🔍 [Backend] Raw references from database:', references);
      console.log('🔍 [Backend] Mapped references for frontend:', mappedReferences);
      
      // First, let's see what records exist
      const [allGovernmentIds] = await connection.execute(
        'SELECT * FROM employee_govid WHERE emp_objid = ? ORDER BY created_at DESC',
        [employee.objid]
      );
      
      console.log('🔍 [Backend] All government IDs for employee:', allGovernmentIds);
      
      // Filter for active/valid records, or if no status column exists, take the most recent
      let [governmentIds] = await connection.execute(
        'SELECT * FROM employee_govid WHERE emp_objid = ? AND (status = "active" OR status = "valid" OR status IS NULL OR status = "") ORDER BY created_at DESC LIMIT 1',
        [employee.objid]
      );
      
      // If no active records found, but records exist, take the most recent one
      if (governmentIds.length === 0 && allGovernmentIds.length > 0) {
        console.log('🔍 [Backend] No active records found, using most recent record');
        governmentIds = [allGovernmentIds[0]]; // Take the most recent record
      }
      
      const [declarations] = await connection.execute(
        'SELECT * FROM employee_declaration WHERE emp_objid = ?',
        [employee.objid]
      );
      
      console.log('🔍 [Backend] Raw declarations from database:', declarations);
      
      console.log(`🔍 [PdsDtrChecker] Querying media for emp_objid: ${employee.objid}`);
      const [media] = await connection.execute(
        'SELECT * FROM employees_media WHERE emp_objid = ?',
        [employee.objid]
      );
      console.log(`🔍 [PdsDtrChecker] Media query result:`, media);
      
      connection.release();
      
      // Helper function to format date for frontend (YYYY-MM-DD)
      // This function ensures NO timezone conversion occurs
      const formatDateForFrontend = (dateValue) => {
        if (!dateValue) return '';
        
        const stringValue = String(dateValue).trim();
        
        // If it's already a string in YYYY-MM-DD format, return as-is (no conversion)
        if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
          return stringValue;
        }
        
        // Handle DD/M/YYYY format (from database) - convert to YYYY-MM-DD
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(stringValue)) {
          const [day, month, year] = stringValue.split('/');
          const paddedDay = day.padStart(2, '0');
          const paddedMonth = month.padStart(2, '0');
          const formattedDate = `${year}-${paddedMonth}-${paddedDay}`;
          return formattedDate;
        }
        
        // If it's an ISO date string with time, extract just the date part (before 'T') without timezone conversion
        if (stringValue.includes('T')) {
          const datePart = stringValue.split('T')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            return datePart;
          }
        }
        
        // If it's a date string with space separator (YYYY-MM-DD HH:MM:SS), extract date part
        if (stringValue.includes(' ')) {
          const datePart = stringValue.split(' ')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            return datePart;
          }
        }
        
        // If it's a Date object, extract date components using UTC to avoid timezone shifts
        // This ensures the date displayed matches what was stored in the database
        if (dateValue instanceof Date) {
          const year = dateValue.getUTCFullYear();
          const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
          const day = String(dateValue.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        
        // Last resort: try to parse as Date but use UTC methods
        try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            // Use UTC methods to avoid timezone conversion
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
          }
        } catch (e) {
          // Ignore parsing errors
        }
        
        return '';
      };

      // Map database fields to frontend field names
      const mappedEmployee = {
        ...employee,
        // Map gender back to sex for frontend compatibility
        sex: employee.gender || '',
        // Map birthdate/birthplace to date_of_birth/place_of_birth for frontend compatibility
        date_of_birth: formatDateForFrontend(employee.birthdate),
        place_of_birth: employee.birthplace || '',
        // Map citizenship fields
        citizenship_filipino: true, // Always true as per requirement
        citizenship_dual: !!(employee.dual_citizenship_type || employee.dual_citizenship_country)
      };
      
      console.log('📝 [PdsDtrChecker] Original employee data:', {
        gender: employee.gender,
        birthdate: employee.birthdate,
        birthplace: employee.birthplace
      });
      
      console.log('📝 [PdsDtrChecker] Mapped employee data:', {
        sex: mappedEmployee.sex,
        date_of_birth: mappedEmployee.date_of_birth,
        place_of_birth: mappedEmployee.place_of_birth
      });
      
      // Map government IDs to frontend field names
      const mappedGovernmentIds = governmentIds.map(govId => ({
        government_issued_id: govId.gov_id || '',
        id_number: govId.gov_id_number || '',
        date_issued: govId.gov_id_dateissued || '',
        place_of_issuance: govId.gov_id_placeissued || '',
        status: govId.status || 'active'
      }));
      
      // Map media fields to frontend field names and convert paths to base64 data URLs
      const formatDateYMD = (val) => {
        if (!val) return '';
        try {
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
          const d = new Date(val);
          if (Number.isNaN(d.getTime())) return '';
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        } catch {
          return '';
        }
      };

      const mappedMedia = media[0] ? {
        signature: media[0].signature_path ? await readMediaAsBase64(media[0].signature_path) : '',
        photo: media[0].photo_path ? await readMediaAsBase64(media[0].photo_path) : '',
        thumb: media[0].thumb_path ? await readMediaAsBase64(media[0].thumb_path) : '',
        date_accomplished: formatDateYMD(media[0].date_accomplished || '')
      } : {};
      
      // Debug logging for media paths
      if (media[0]) {
        console.log('🔍 Media paths from database:');
        console.log('  signature_path:', media[0].signature_path);
        console.log('  photo_path:', media[0].photo_path);
        console.log('  thumb_path:', media[0].thumb_path);
        console.log('🔍 Mapped media data:');
        console.log('  signature loaded:', !!mappedMedia.signature);
        console.log('  photo loaded:', !!mappedMedia.photo);
        console.log('  thumb loaded:', !!mappedMedia.thumb);
      }
      
      const pdsData = {
        employee: mappedEmployee,
        addresses,
        children,
        education,
        eligibility,
        workExperience,
        voluntaryWork,
        trainings,
        skills,
        recognitions,
        memberships,
        references: mappedReferences,
        governmentIds: mappedGovernmentIds,
        declarations: declarations[0] || {},
        media: mappedMedia,
        ispdsentrylock: employee.ispdsentrylock || 0
      };
      
      console.log('🔍 [Backend] Raw government IDs from database:', governmentIds);
      console.log('🔍 [Backend] Mapped government IDs for frontend:', mappedGovernmentIds);
      console.log('🔍 [Backend] Raw media from database:', media[0]);
      console.log('🔍 [Backend] Declarations being sent to frontend:', pdsData.declarations);
      console.log(`✅ [PdsDtrChecker] PDS data fetched successfully`);
      res.json({ success: true, data: pdsData });
      
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ [PdsDtrChecker] Error fetching PDS:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch PDS data',
      error: error.message 
    });
  }
};

// POST /api/pds-dtrchecker/me - Save PDS data for logged-in user
export const savePDSForCurrentUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    // Extract user ID from auth middleware - JWT contains USERID field
    const userId = req.user.USERID;
    
    console.log(`💾 [PdsDtrChecker] Saving PDS for user ID: ${userId}`);
    console.log(`💾 [PdsDtrChecker] Full user object:`, req.user);
    
    // Log the incoming request body to see what's being received
    console.log('📥 [Backend] Request body received - employee data:', {
      date_of_birth: req.body?.employee?.date_of_birth,
      birthdate: req.body?.employee?.birthdate,
      place_of_birth: req.body?.employee?.place_of_birth,
      birthplace: req.body?.employee?.birthplace,
      sex: req.body?.employee?.sex,
      gender: req.body?.employee?.gender,
      dtruserid: req.body?.employee?.dtruserid
    });
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in authentication context'
      });
    }
    
    const {
      employee = {},
      children = [],
      education = [],
      civil_service_eligibility = [],
      work_experience = [],
      // Page 3 data
      voluntary_work = [],
      trainings = [],
      skills = [],
      recognitions = [],
      memberships = [],
      // Page 4 data
      declarations = {},
      references = [],
      government_ids = [],
      is_replacing_gov_id = false,
      signature_data,
      photo_data,
      thumbmark_data,
      date_accomplished,
      is_draft = false
    } = req.body;

    // Validate user can only update their own PDS
    const connection = await pool.getConnection();
    connection.config.connectTimeout = 5000;
    
    let msBadge = null;
    try {
      const mssqlPool = getDb();
      const rs = await mssqlPool.request().input('uid', sql.Int, Number(userId)).query('SELECT BADGENUMBER FROM USERINFO WHERE USERID = @uid');
      if (rs.recordset && rs.recordset.length > 0) {
        msBadge = rs.recordset[0].BADGENUMBER ? String(rs.recordset[0].BADGENUMBER) : null;
      }
    } catch (e) {
      console.warn('⚠️ [PdsDtrChecker] Unable to fetch BADGENUMBER from MSSQL USERINFO:', e.message);
    }
    
    const parsePortalName = (rawName = '') => {
      if (!rawName) {
        return { surname: '', firstname: '', middlename: '' };
      }
      const [lastPart, rest = ''] = rawName.split(',').map((part) => part?.trim() || '');
      if (!rest) {
        return { surname: lastPart || rawName.trim(), firstname: '', middlename: '' };
      }
      const restParts = rest.split(/\s+/).filter(Boolean);
      const firstname = restParts.shift() || '';
      const middlename = restParts.join(' ');
      return {
        surname: lastPart || '',
        firstname,
        middlename
      };
    };
    
    try {
      // Verify employee exists and belongs to logged-in user
      let [employees] = await connection.execute(
        'SELECT * FROM employees WHERE dtruserid = ? LIMIT 1',
        [userId]
      );
      
      if (employees.length === 0) {
        const [portalRows] = await connection.execute(
          'SELECT dtrname, emailaddress FROM sysusers_portal WHERE dtruserid = ? LIMIT 1',
          [userId]
        );

        if (portalRows.length === 0) {
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'Employee record not found for current user and no portal profile exists. Please contact HR to link your account.'
          });
        }

        const portalUser = portalRows[0];
        const { surname, firstname, middlename } = parsePortalName(portalUser.dtrname || '');
        const newEmployeeObjId = uuidv4();

        await connection.execute(
          `INSERT INTO employees (
            objid, dtruserid, dtrbadgenumber, surname, firstname, middlename, email, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            newEmployeeObjId,
            userId,
            msBadge ?? existingEmployeeRecord?.dtrbadgenumber ?? null,
            surname || '',
            firstname || '',
            middlename || '',
            portalUser.emailaddress || null
          ]
        );

        employees = [{
          objid: newEmployeeObjId,
          dtruserid: userId,
          surname: surname || '',
          firstname: firstname || '',
          middlename: middlename || '',
          email: portalUser.emailaddress || null
        }];

        console.log(`✅ [PdsDtrChecker] Auto-created employees record ${newEmployeeObjId} for USERID ${userId}`);
      }

      await connection.query('START TRANSACTION');

      try {
        const existingEmployeeRecord = employees[0] || {};
        const employeePayload = employee || {};
        
        // Log what we received in employeePayload
        console.log('🔍 [Backend] employeePayload keys:', Object.keys(employeePayload));
        console.log('🔍 [Backend] employeePayload.date_of_birth:', employeePayload.date_of_birth, 'Type:', typeof employeePayload.date_of_birth);
        console.log('🔍 [Backend] employeePayload.birthdate:', employeePayload.birthdate, 'Type:', typeof employeePayload.birthdate);
        console.log('🔍 [Backend] employeePayload.place_of_birth:', employeePayload.place_of_birth, 'Type:', typeof employeePayload.place_of_birth);
        console.log('🔍 [Backend] employeePayload.birthplace:', employeePayload.birthplace, 'Type:', typeof employeePayload.birthplace);
        console.log('🔍 [Backend] employeePayload.sex:', employeePayload.sex, 'Type:', typeof employeePayload.sex);
        console.log('🔍 [Backend] employeePayload.gender:', employeePayload.gender, 'Type:', typeof employeePayload.gender);
        console.log('🔍 [Backend] employeePayload has date_of_birth?', 'date_of_birth' in employeePayload);
        console.log('🔍 [Backend] employeePayload has birthdate?', 'birthdate' in employeePayload);

        // Helper function to normalize date fields
        const normalizeDate = (value) => {
          if (!value || value === '' || value === 'null' || value === 'undefined') return null;
          
          const stringValue = String(value).trim();
          
          // If it's already in YYYY-MM-DD format, return as is (no timezone conversion)
          if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
            return stringValue;
          }
          
          // If it's an ISO date string with time, extract just the date part (before 'T') without timezone conversion
          if (stringValue.includes('T')) {
            const datePart = stringValue.split('T')[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
              return datePart;
            }
          }
          
          // If it's a date string with space separator (YYYY-MM-DD HH:MM:SS), extract date part
          if (stringValue.includes(' ')) {
            const datePart = stringValue.split(' ')[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
              return datePart;
            }
          }
          
          // If it's a Date object, extract date components using UTC to avoid timezone shifts
          // This ensures the date stored in the database matches what was entered
          if (value instanceof Date) {
            const year = value.getUTCFullYear();
            const month = String(value.getUTCMonth() + 1).padStart(2, '0');
            const day = String(value.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          
          return value;
        };

        // Helper function to normalize year fields (convert year to date)
        const normalizeYear = (value) => {
          if (!value || value === '' || value === 'null' || value === 'undefined') return null;
          
          // Convert to string and trim whitespace
          const stringValue = String(value).trim();
          
          // If it's just a year (4 digits), convert to January 1st of that year
          if (/^\d{4}$/.test(stringValue)) {
            const year = parseInt(stringValue);
            // Validate year range (reasonable graduation years)
            if (year >= 1900 && year <= new Date().getFullYear() + 10) {
              return `${year}-01-01`;
            } else {
              console.log(`⚠️ Invalid year value: ${value}, skipping`);
              return null;
            }
          }
          
          // If it's already a valid date format, return as is
          if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
            return stringValue;
          }
          
          // If it's a date with time, extract just the date part
          if (stringValue.includes('T')) {
            try {
              const date = new Date(stringValue);
              return date.toISOString().split('T')[0];
            } catch (error) {
              console.log(`⚠️ Error parsing date: ${value}`, error);
              return null;
            }
          }
          
          console.log(`⚠️ Unrecognized year format: ${value}, skipping`);
          return null;
        };

        // Normalize incoming employee fields
        const normalized = {
          dtruserid: employeePayload.dtruserid ?? employeePayload.DTRuserID ?? existingEmployeeRecord.dtruserid ?? userId,
          dtrbadgenumber: msBadge ?? employeePayload.dtrbadgenumber ?? employeePayload.BadgeNumber ?? existingEmployeeRecord.dtrbadgenumber ?? null,
          surname: employeePayload.surname ?? existingEmployeeRecord.surname ?? '',
          firstname: employeePayload.firstname ?? existingEmployeeRecord.firstname ?? '',
          middlename: employeePayload.middlename ?? existingEmployeeRecord.middlename ?? '',
          extension: employeePayload.extension ?? employeePayload.name_extension ?? existingEmployeeRecord.extension ?? '',
          birthdate: (() => {
            const rawDate = employeePayload.birthdate ?? employeePayload.date_of_birth ?? existingEmployeeRecord.birthdate;
            console.log('🔍 [Backend] Raw birthdate received:', rawDate, 'Type:', typeof rawDate);
            console.log('🔍 [Backend] Is YYYY-MM-DD format?', rawDate ? /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate)) : 'N/A');
            
            if (!rawDate || rawDate === '' || rawDate === 'null' || rawDate === 'undefined') {
              console.log('🔍 [Backend] Birthdate is empty, returning null');
              return null;
            }
            
            // If it's already a string in YYYY-MM-DD format, use it directly (no conversion)
            const stringValue = String(rawDate).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
              console.log('✅ [Backend] Birthdate already in YYYY-MM-DD format, using directly without conversion:', stringValue);
              return stringValue;
            }
            
            // Otherwise, normalize it
            console.log('⚠️ [Backend] Birthdate not in YYYY-MM-DD format, normalizing...');
            const normalizedDate = normalizeDate(rawDate);
            console.log('🔍 [Backend] Normalized birthdate value:', normalizedDate, 'Type:', typeof normalizedDate);
            return normalizedDate;
          })(),
          birthplace: (() => {
            // Check if place_of_birth or birthplace is explicitly provided in the payload (even if empty string)
            const hasPlaceOfBirth = 'place_of_birth' in employeePayload;
            const hasBirthplace = 'birthplace' in employeePayload;
            
            let value;
            if (hasPlaceOfBirth) {
              // If place_of_birth is explicitly in payload, use it (even if empty string)
              value = employeePayload.place_of_birth;
            } else if (hasBirthplace) {
              // If birthplace is explicitly in payload, use it (even if empty string)
              value = employeePayload.birthplace;
            } else {
              // If not in payload, use existing value
              value = existingEmployeeRecord.birthplace;
            }
            
            // Normalize and truncate to VARCHAR(100) limit
            let result = value !== null && value !== undefined ? String(value).trim() : '';
            // Truncate to 100 characters to match database column definition VARCHAR(100)
            if (result.length > 100) {
              console.warn('⚠️ [Backend] Birthplace exceeds 100 characters, truncating from', result.length, 'to 100');
              result = result.substring(0, 100);
            }
            
            console.log('🔍 [Backend] Normalized birthplace:', result, 'from:', { 
              hasPlaceOfBirth, 
              hasBirthplace,
              place_of_birth: employeePayload.place_of_birth, 
              birthplace: employeePayload.birthplace, 
              existing: existingEmployeeRecord.birthplace,
              finalValue: result,
              length: result.length
            });
            return result;
          })(),
          gender: (() => {
            const value = employeePayload.gender ?? employeePayload.sex ?? existingEmployeeRecord.gender;
            const result = value !== null && value !== undefined ? String(value).trim() : '';
            console.log('🔍 [Backend] Normalized gender:', result, 'from:', { gender: employeePayload.gender, sex: employeePayload.sex, existing: existingEmployeeRecord.gender });
            return result;
          })(),
          civil_status: employeePayload.civil_status ?? existingEmployeeRecord.civil_status ?? '',
          height: employeePayload.height ? employeePayload.height.toString().substring(0, 5) : (existingEmployeeRecord.height ? existingEmployeeRecord.height.toString().substring(0, 5) : null),
          weight: employeePayload.weight ? employeePayload.weight.toString().substring(0, 5) : (existingEmployeeRecord.weight ? existingEmployeeRecord.weight.toString().substring(0, 5) : null),
          blood_type: employeePayload.blood_type ? employeePayload.blood_type.toString().substring(0, 4) : (existingEmployeeRecord.blood_type ? existingEmployeeRecord.blood_type.toString().substring(0, 4) : null),
          gsis: employeePayload.gsis ? employeePayload.gsis.toString().substring(0, 20) : (existingEmployeeRecord.gsis ? existingEmployeeRecord.gsis.toString().substring(0, 20) : null),
          pagibig: employeePayload.pagibig ? employeePayload.pagibig.toString().substring(0, 20) : (existingEmployeeRecord.pagibig ? existingEmployeeRecord.pagibig.toString().substring(0, 20) : null),
          philhealth: employeePayload.philhealth ? employeePayload.philhealth.toString().substring(0, 20) : (existingEmployeeRecord.philhealth ? existingEmployeeRecord.philhealth.toString().substring(0, 20) : null),
          sss: employeePayload.sss ? employeePayload.sss.toString().substring(0, 20) : (existingEmployeeRecord.sss ? existingEmployeeRecord.sss.toString().substring(0, 20) : null),
          tin: employeePayload.tin ? employeePayload.tin.toString().substring(0, 20) : (existingEmployeeRecord.tin ? existingEmployeeRecord.tin.toString().substring(0, 20) : null),
          agency_no: employeePayload.agency_no ? employeePayload.agency_no.toString().substring(0, 20) : (existingEmployeeRecord.agency_no ? existingEmployeeRecord.agency_no.toString().substring(0, 20) : null),
          citizenship: employeePayload.citizenship ?? existingEmployeeRecord.citizenship ?? null,
          dual_citizenship_type: employeePayload.dual_citizenship_type ?? existingEmployeeRecord.dual_citizenship_type ?? null,
          dual_citizenship_country: employeePayload.dual_citizenship_country ?? existingEmployeeRecord.dual_citizenship_country ?? null,
          telephone: employeePayload.telephone ?? existingEmployeeRecord.telephone ?? null,
          mobile: employeePayload.mobile ?? existingEmployeeRecord.mobile ?? null,
          email: employeePayload.email ?? existingEmployeeRecord.email ?? null,
          father_surname: employeePayload.father_surname ?? existingEmployeeRecord.father_surname ?? null,
          father_firstname: employeePayload.father_firstname ?? existingEmployeeRecord.father_firstname ?? null,
          father_middlename: employeePayload.father_middlename ?? existingEmployeeRecord.father_middlename ?? null,
          father_extension: employeePayload.father_extension ?? existingEmployeeRecord.father_extension ?? null,
          mother_surname: employeePayload.mother_surname ?? existingEmployeeRecord.mother_surname ?? null,
          mother_firstname: employeePayload.mother_firstname ?? existingEmployeeRecord.mother_firstname ?? null,
          mother_middlename: employeePayload.mother_middlename ?? existingEmployeeRecord.mother_middlename ?? null
        };

        // Upsert employee by dtruserid
        const [existing] = await connection.execute(
          'SELECT objid FROM employees WHERE TRIM(CAST(dtruserid AS CHAR)) = ? LIMIT 1',
          [String(normalized.dtruserid)]
        );

        let employeeObjId = existing.length ? existing[0].objid : uuidv4();

        // Ensure birthdate is a valid string or null before database operation
        // This prevents any timezone conversion by ensuring we only pass YYYY-MM-DD strings
        console.log('💾 [Backend] Normalized.birthdate before DB validation:', normalized.birthdate, 'Type:', typeof normalized.birthdate);
        const birthdateForDb = normalized.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(String(normalized.birthdate)) 
          ? String(normalized.birthdate) 
          : null;
        console.log('💾 [Backend] Birthdate value being saved to database:', birthdateForDb, 'Type:', typeof birthdateForDb);
        console.log('💾 [Backend] Final validation - Is valid YYYY-MM-DD?', birthdateForDb ? /^\d{4}-\d{2}-\d{2}$/.test(birthdateForDb) : 'null');
        console.log('💾 [Backend] Birthdate string representation:', JSON.stringify(birthdateForDb));
        console.log('💾 [Backend] Normalized birthplace being saved:', normalized.birthplace, 'Type:', typeof normalized.birthplace, 'Length:', normalized.birthplace?.length);
        console.log('💾 [Backend] Normalized gender being saved:', normalized.gender, 'Type:', typeof normalized.gender);
        
        // Verify the SQL parameter order matches the values
        console.log('💾 [Backend] SQL UPDATE parameters (first 10):', [
          normalized.dtrbadgenumber, 
          normalized.surname, 
          normalized.firstname, 
          normalized.middlename, 
          normalized.extension,
          birthdateForDb, 
          normalized.birthplace,  // This should be the 7th parameter
          normalized.gender, 
          normalized.civil_status
        ].slice(0, 10));
        
        // Log the SQL that will be executed
        if (birthdateForDb) {
          console.log('💾 [Backend] SQL will pass date string directly to DATE column:', birthdateForDb);
        } else {
          console.log('💾 [Backend] SQL will use: NULL for birthdate');
        }
        
        // Ensure birthplace is properly formatted for database (VARCHAR(100))
        const birthplaceForDb = normalized.birthplace !== null && normalized.birthplace !== undefined 
          ? String(normalized.birthplace).trim().substring(0, 100) 
          : '';
        
        // Log the exact SQL statement with birthplace
        console.log('💾 [Backend] About to execute UPDATE/INSERT with birthplace:', JSON.stringify(birthplaceForDb), 'Type:', typeof birthplaceForDb, 'Length:', birthplaceForDb.length);

        if (existing.length) {
          // For MySQL DATE type, pass the date string directly in YYYY-MM-DD format
          // DATE type doesn't have time component, so no timezone conversion occurs
          await connection.execute(`
            UPDATE employees SET
              dtrbadgenumber = ?, surname = ?, firstname = ?, middlename = ?, extension = ?,
              birthdate = ?, birthplace = ?, gender = ?, civil_status = ?,
              height = ?, weight = ?, blood_type = ?, gsis = ?, pagibig = ?, philhealth = ?, sss = ?, tin = ?, agency_no = ?,
              citizenship = ?, dual_citizenship_type = ?, dual_citizenship_country = ?,
              telephone = ?, mobile = ?, email = ?,
              father_surname = ?, father_firstname = ?, father_middlename = ?, father_extension = ?,
              mother_surname = ?, mother_firstname = ?, mother_middlename = ?,
              updated_at = NOW()
            WHERE objid = ?
          `, [
            normalized.dtrbadgenumber, normalized.surname, normalized.firstname, normalized.middlename, normalized.extension,
            birthdateForDb, birthplaceForDb, normalized.gender, normalized.civil_status,
            normalized.height, normalized.weight, normalized.blood_type, normalized.gsis, normalized.pagibig, normalized.philhealth, normalized.sss, normalized.tin, normalized.agency_no,
            normalized.citizenship, normalized.dual_citizenship_type, normalized.dual_citizenship_country,
            normalized.telephone, normalized.mobile, normalized.email,
            normalized.father_surname, normalized.father_firstname, normalized.father_middlename, normalized.father_extension,
            normalized.mother_surname, normalized.mother_firstname, normalized.mother_middlename,
            employeeObjId
          ]);
          
          // Verify the update was successful
          const [verifyUpdate] = await connection.execute(
            'SELECT birthplace, gender FROM employees WHERE objid = ?',
            [employeeObjId]
          );
          console.log('✅ [Backend] After UPDATE - Birthplace:', verifyUpdate[0]?.birthplace, 'Gender:', verifyUpdate[0]?.gender);
        } else {
          // For MySQL DATE type, pass the date string directly in YYYY-MM-DD format
          // DATE type doesn't have time component, so no timezone conversion occurs
          await connection.execute(`
            INSERT INTO employees (
              objid, dtruserid, dtrbadgenumber, surname, firstname, middlename, extension,
              birthdate, birthplace, gender, civil_status,
              height, weight, blood_type, gsis, pagibig, philhealth, sss, tin, agency_no,
              citizenship, dual_citizenship_type, dual_citizenship_country,
              telephone, mobile, email,
              father_surname, father_firstname, father_middlename, father_extension,
              mother_surname, mother_firstname, mother_middlename,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, [
            employeeObjId, normalized.dtruserid, normalized.dtrbadgenumber, normalized.surname, normalized.firstname, normalized.middlename, normalized.extension,
            birthdateForDb, birthplaceForDb, normalized.gender, normalized.civil_status,
            normalized.height, normalized.weight, normalized.blood_type, normalized.gsis, normalized.pagibig, normalized.philhealth, normalized.sss, normalized.tin, normalized.agency_no,
            normalized.citizenship, normalized.dual_citizenship_type, normalized.dual_citizenship_country,
            normalized.telephone, normalized.mobile, normalized.email,
            normalized.father_surname, normalized.father_firstname, normalized.father_middlename, normalized.father_extension,
            normalized.mother_surname, normalized.mother_firstname, normalized.mother_middlename
          ]);
          
          // Verify the insert was successful
          const [verifyInsert] = await connection.execute(
            'SELECT birthplace, gender FROM employees WHERE objid = ?',
            [employeeObjId]
          );
          console.log('✅ [Backend] After INSERT - Birthplace:', verifyInsert[0]?.birthplace, 'Gender:', verifyInsert[0]?.gender);
        }

        // Handle media files - process if new media is being uploaded OR if date_accomplished is being updated
        const hasNewMedia = signature_data || photo_data || thumbmark_data;
        // Check if date_accomplished is provided (even if null, to allow clearing existing dates)
        const hasDateAccomplished = date_accomplished !== undefined;
        // Check if date_accomplished has a valid value (not empty string)
        const isValidDate = date_accomplished && typeof date_accomplished === 'string' && date_accomplished.trim() !== '';

        if (hasNewMedia || hasDateAccomplished) {
          try {
            // Decode base64 data URLs to binary buffers
            const decode = (data) => {
              if (!data) return null;
              const base64 = (typeof data === 'string') ? data.replace(/^data:.*;base64,/, '') : '';
              if (!base64) return null; // Treat empty base64 as no data
              try { return Buffer.from(base64, 'base64'); } catch { return null; }
            };

            const sigBuf = decode(signature_data);
            const photoBuf = decode(photo_data);
            const thumbBuf = decode(thumbmark_data);

            console.log(`🖼️ Processing media - Signature: ${sigBuf ? `${sigBuf.length} bytes` : 'none'}, Photo: ${photoBuf ? `${photoBuf.length} bytes` : 'none'}, Thumb: ${thumbBuf ? `${thumbBuf.length} bytes` : 'none'}`);

            const mediaFiles = {};

            // Check for existing media files
            const [existingMedia] = await connection.execute(
              'SELECT signature_path, photo_path, thumb_path FROM employees_media WHERE emp_objid = ? LIMIT 1',
              [employeeObjId]
            );

            if (sigBuf) {
              // Delete old signature if exists and new one is being uploaded
              if (existingMedia.length > 0 && existingMedia[0].signature_path) {
                await deleteMediaFile(existingMedia[0].signature_path);
              }
              const signaturePath = await saveMediaFile(sigBuf, 'signature', employeeObjId);
              mediaFiles.signature_path = signaturePath;
            }

            if (photoBuf) {
              // Delete old photo if exists and new one is being uploaded
              if (existingMedia.length > 0 && existingMedia[0].photo_path) {
                await deleteMediaFile(existingMedia[0].photo_path);
              }
              const photoPath = await saveMediaFile(photoBuf, 'photo', employeeObjId);
              mediaFiles.photo_path = photoPath;
            }

            if (thumbBuf) {
              // Delete old thumbmark if exists and new one is being uploaded
              if (existingMedia.length > 0 && existingMedia[0].thumb_path) {
                await deleteMediaFile(existingMedia[0].thumb_path);
              }
              const thumbPath = await saveMediaFile(thumbBuf, 'thumb', employeeObjId);
              mediaFiles.thumb_path = thumbPath;
            }

          // Save media record - ensure only 1 record per user
          if (Object.keys(mediaFiles).length > 0 || hasDateAccomplished) {
            // Use provided date_accomplished, or null if empty/undefined
            // This allows users to clear existing dates by sending null
            const dateAccomplished = isValidDate ? date_accomplished.trim() : null;

            // Check if media record already exists
            const [existingMedia] = await connection.execute(
              'SELECT objid, signature_path, photo_path, thumb_path FROM employees_media WHERE emp_objid = ? LIMIT 1',
              [employeeObjId]
            );

            if (existingMedia.length > 0) {
              // Update existing record - only update paths when new files exist; always allow date update
              if (Object.keys(mediaFiles).length > 0) {
                await connection.execute(`
                  UPDATE employees_media SET 
                    signature_path = ?, photo_path = ?, thumb_path = ?, 
                    date_accomplished = ?, updated_at = NOW()
                  WHERE emp_objid = ?
                `, [
                  mediaFiles.signature_path || existingMedia[0].signature_path,
                  mediaFiles.photo_path || existingMedia[0].photo_path,
                  mediaFiles.thumb_path || existingMedia[0].thumb_path,
                  dateAccomplished,
                  employeeObjId
                ]);
              } else if (hasDateAccomplished) {
                await connection.execute(`
                  UPDATE employees_media SET 
                    date_accomplished = ?, updated_at = NOW()
                  WHERE emp_objid = ?
                `, [
                  dateAccomplished,
                  employeeObjId
                ]);
              }
              console.log(`✅ Updated existing media record for user: ${employeeObjId}`);
            } else {
              // Insert new record only if we actually have media files
              if (Object.keys(mediaFiles).length > 0) {
                await connection.execute(`
                  INSERT INTO employees_media (objid, emp_objid, signature_path, photo_path, thumb_path, date_accomplished, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                `, [
                  uuidv4(),
                  employeeObjId,
                  mediaFiles.signature_path || null,
                  mediaFiles.photo_path || null,
                  mediaFiles.thumb_path || null,
                  dateAccomplished
                ]);
                console.log(`✅ Inserted new media record for user: ${employeeObjId}`);
              } else if (hasDateAccomplished && isValidDate) {
                // If only date is provided and no media exists yet, create a minimal row with null paths
                // Only create if date is valid (not null/empty)
                await connection.execute(`
                  INSERT INTO employees_media (objid, emp_objid, signature_path, photo_path, thumb_path, date_accomplished, created_at, updated_at)
                  VALUES (?, ?, NULL, NULL, NULL, ?, NOW(), NOW())
                `, [
                  uuidv4(),
                  employeeObjId,
                  dateAccomplished
                ]);
                console.log(`✅ Inserted date-only media record for user: ${employeeObjId}`);
              }
            }
          }
          } catch (mediaError) {
            console.error('❌ Error processing media:', mediaError);
            console.log('📝 Skipping media processing due to error');
          }
        }

        // Save education records
        if (education && education.length > 0) {
          // Delete existing education records first
          await connection.execute('DELETE FROM employee_education WHERE emp_objid = ?', [employeeObjId]);
          
          // Insert new education records
          for (const edu of education) {
            if (edu.school_name || edu.degree_course) {
              await connection.execute(`
                INSERT INTO employee_education (
                  objid, emp_objid, level, school_name, course, 
                  \`from\`, \`to\`, highest_level, year_graduated, honor_received,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                edu.level || null,
                edu.school_name || null,
                edu.degree_course || null,
                normalizeDate(edu.period_from) || null,
                normalizeDate(edu.period_to) || null,
                edu.highest_level_units || null,
                normalizeYear(edu.year_graduated) || null,
                edu.scholarship_honors || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${education.length} education records`);
        }

        // Save work experience records
        // Always delete existing work experience records first
        await connection.execute('DELETE FROM employee_workexperience WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new work experience records if any exist
        if (work_experience && work_experience.length > 0) {
          for (const work of work_experience) {
            if (work.position_title || work.department_agency_company) {
              await connection.execute(`
                INSERT INTO employee_workexperience (
                  objid, emp_objid, position, department_name, \`from\`, \`to\`,
                  monthly_salary, pay_grade, appointment_status, gov_service, ispresent,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                work.position_title || null,
                work.department_agency_company || null,
                normalizeDate(work.date_from) || null,
                normalizeDate(work.date_to) || null,
                work.monthly_salary || null,
                work.salary_grade_step || null,
                work.status_of_appointment || null,
                work.government_service || null,
                work.is_present || false
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${work_experience.length} work experience records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No work experience records to save (all deleted)`);
        }

        // Save voluntary work records
        // Always delete existing voluntary work records first
        await connection.execute('DELETE FROM employee_voluntary WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new voluntary work records if any exist
        if (voluntary_work && voluntary_work.length > 0) {
          for (const work of voluntary_work) {
            if (work.organization_name_address || work.position_nature_of_work) {
              await connection.execute(`
                INSERT INTO employee_voluntary (
                  objid, emp_objid, org_address, \`from\`, \`to\`,
                  num_of_hours, position_of_work, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                work.organization_name_address || null,
                normalizeDate(work.date_from) || null,
                normalizeDate(work.date_to) || null,
                work.number_of_hours || null,
                work.position_nature_of_work || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${voluntary_work.length} voluntary work records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No voluntary work records to save (all deleted)`);
        }

        // Save civil service eligibility records
        // Always delete existing eligibility records first
        await connection.execute('DELETE FROM employee_eligibility WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new eligibility records if any exist
        if (civil_service_eligibility && civil_service_eligibility.length > 0) {
          for (const el of civil_service_eligibility) {
            if (el.eligibility_type || el.rating) {
              // Get the ID for the eligibility type
              let careerServiceId = null;
              if (el.eligibility_type) {
                const [eligibilityTypeResult] = await connection.execute(
                  'SELECT id FROM eligibilitytypes WHERE careertypes = ? LIMIT 1',
                  [el.eligibility_type]
                );
                if (eligibilityTypeResult.length > 0) {
                  careerServiceId = eligibilityTypeResult[0].id;
                }
              }
              
              await connection.execute(`
                INSERT INTO employee_eligibility (
                  objid, emp_objid, career_service, rating, date_of_exam, 
                  place_of_exam, license_number, license_validity,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                careerServiceId,
                el.rating || null,
                normalizeDate(el.date_of_examination) || null,
                el.place_of_examination || null,
                el.license_number || null,
                normalizeDate(el.date_of_validity) || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${civil_service_eligibility.length} eligibility records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No eligibility records to save (all deleted)`);
        }

        // Save address records
        if (employee) {
          // Delete existing address records
          await connection.execute('DELETE FROM employee_address WHERE emp_objid = ?', [employeeObjId]);
          
          // Insert new address record
          await connection.execute(`
            INSERT INTO employee_address (
              objid, emp_objid, 
              resi_province, resi_city, resi_barangay, resi_zip, resi_village, resi_street, resi_house,
              perma_province, perma_city, perma_barangay, perma_zip, perma_village, perma_street, perma_house
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            uuidv4(), employeeObjId,
            employee.residential_province || null,
            employee.residential_city_municipality || null,
            employee.residential_barangay || null,
            employee.residential_zip_code || null,
            employee.residential_subdivision_village || null,
            employee.residential_street || null,
            employee.residential_house_block_lot || null,
            employee.permanent_province || null,
            employee.permanent_city_municipality || null,
            employee.permanent_barangay || null,
            employee.permanent_zip_code || null,
            employee.permanent_subdivision_village || null,
            employee.permanent_street || null,
            employee.permanent_house_block_lot || null
          ]);
          console.log(`✅ [PdsDtrChecker] Saved address records`);
        }

        // Save spouse information
        if (employee && (employee.spouse_surname || employee.spouse_firstname || employee.spouse_middlename)) {
          // Delete existing spouse records
          await connection.execute('DELETE FROM employee_spouses WHERE emp_objid = ?', [employeeObjId]);
          
          // Insert new spouse record
          await connection.execute(`
            INSERT INTO employee_spouses (
              objid, emp_objid, 
              spouse_surname, spouse_firstname, spouse_middlename, spouse_extension,
              spouse_occupation, employer_businessname, business_address, telephone_no, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            uuidv4(), employeeObjId,
            employee.spouse_surname ? employee.spouse_surname.toString().substring(0, 50) : null,
            employee.spouse_firstname ? employee.spouse_firstname.toString().substring(0, 50) : null,
            employee.spouse_middlename ? employee.spouse_middlename.toString().substring(0, 50) : null,
            employee.spouse_extension ? employee.spouse_extension.toString().substring(0, 10) : null,
            employee.spouse_occupation ? employee.spouse_occupation.toString().substring(0, 30) : null,
            employee.spouse_employer_business_name ? employee.spouse_employer_business_name.toString().substring(0, 50) : null,
            employee.spouse_business_address ? employee.spouse_business_address.toString().substring(0, 100) : null,
            employee.spouse_telephone ? employee.spouse_telephone.toString().substring(0, 15) : null,
            'Active' // Default status
          ]);
          console.log(`✅ [PdsDtrChecker] Saved spouse record`);
        }

        // Save children records
        // Always delete existing children records first
        await connection.execute('DELETE FROM employee_childrens WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new children records if any exist
        if (children && children.length > 0) {
          for (const child of children) {
            if (child.full_name || child.date_of_birth) {
              await connection.execute(`
                INSERT INTO employee_childrens (
                  objid, emp_objid, name, dateofbirth, created_at, updated_at
                ) VALUES (?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                child.full_name || null,
                normalizeDate(child.date_of_birth) || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${children.length} children records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No children records to save (all deleted)`);
        }

        // Save training records
        // Always delete existing training records first
        await connection.execute('DELETE FROM employee_training WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new training records if any exist
        if (trainings && trainings.length > 0) {
          for (const training of trainings) {
            if (training.training_title || training.conducted_sponsored_by) {
              await connection.execute(`
                INSERT INTO employee_training (
                  objid, emp_objid, title, \`from\`, \`to\`, 
                  num_of_hours, type, conducted, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                training.training_title || null,
                normalizeDate(training.date_from) || null,
                normalizeDate(training.date_to) || null,
                training.number_of_hours || null,
                training.type_of_ld || null,
                training.conducted_sponsored_by || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${trainings.length} training records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No training records to save (all deleted)`);
        }

        // Save membership records
        // Always delete existing membership records first
        await connection.execute('DELETE FROM employee_other_info_membership WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new membership records if any exist
        if (memberships && memberships.length > 0) {
          for (const membership of memberships) {
            if (membership.organization) {
              await connection.execute(`
                INSERT INTO employee_other_info_membership (
                  objid, emp_objid, membership, created_at, updated_at
                ) VALUES (?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                membership.organization || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${memberships.length} membership records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No membership records to save (all deleted)`);
        }

        // Save skills records
        // Always delete existing skills records first
        await connection.execute('DELETE FROM employee_other_info_hobies WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new skills records if any exist
        if (skills && skills.length > 0) {
          for (const skill of skills) {
            if (skill.skill_hobby) {
              await connection.execute(`
                INSERT INTO employee_other_info_hobies (
                  objid, emp_objid, skills_hobbies, created_at, updated_at
                ) VALUES (?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                skill.skill_hobby || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${skills.length} skills records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No skills records to save (all deleted)`);
        }

        // Save recognition records
        // Always delete existing recognition records first
        await connection.execute('DELETE FROM employee_other_info_recognition WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new recognition records if any exist
        if (recognitions && recognitions.length > 0) {
          for (const recognition of recognitions) {
            if (recognition.recognition) {
              await connection.execute(`
                INSERT INTO employee_other_info_recognition (
                  objid, emp_objid, recognition, created_at, updated_at
                ) VALUES (?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                recognition.recognition || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${recognitions.length} recognition records`);
        } else {
          console.log(`✅ [PdsDtrChecker] No recognition records to save (all deleted)`);
        }

        // Save declarations
        if (declarations && Object.keys(declarations).length > 0) {
          const toTinyInt = (value) => (value ? 1 : 0);
          const detailTextValue = (flag, detail) => {
            if (!flag) return null;
            if (detail === undefined || detail === null) return null;
            if (typeof detail === 'string') {
              const trimmed = detail.trim();
              return trimmed.length ? trimmed : null;
            }
            return detail;
          };

          // Delete existing declarations record
          await connection.execute('DELETE FROM employee_declaration WHERE emp_objid = ?', [employeeObjId]);
          
          // Insert new declarations record
          await connection.execute(`
            INSERT INTO employee_declaration (
              objid, emp_objid,
              thirtyfour_a, thirtyfour_b, thirtyfour_b_details,
              thirtyfive_a, thirtyfive_a_details,
              thirtyfive_b, thirtyfive_datefiled, thirtyfive_statuses,
              thirtysix, thirtysix_details,
              thirtyseven, thirtyseven_details,
              thirtyeight_a, thirtyeight_a_details,
              thirtyeight_b, thirtyeight_b_details,
              thirtynine, thirtynine_details,
              forty_a, forty_a_details,
              forty_b, forty_b_details,
              forty_c, forty_c_details,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, [
            uuidv4(), employeeObjId,
            toTinyInt(declarations.thirtyfour_a),
            toTinyInt(declarations.thirtyfour_b),
            detailTextValue(declarations.thirtyfour_b, declarations.thirtyfour_b_details),
            toTinyInt(declarations.thirtyfive_a),
            detailTextValue(declarations.thirtyfive_a, declarations.thirtyfive_a_details),
            toTinyInt(declarations.thirtyfive_b),
            declarations.thirtyfive_b ? normalizeDate(declarations.thirtyfive_datefiled) || null : null,
            detailTextValue(declarations.thirtyfive_b, declarations.thirtyfive_statuses),
            toTinyInt(declarations.thirtysix),
            detailTextValue(declarations.thirtysix, declarations.thirtysix_details),
            toTinyInt(declarations.thirtyseven),
            detailTextValue(declarations.thirtyseven, declarations.thirtyseven_details),
            toTinyInt(declarations.thirtyeight_a),
            detailTextValue(declarations.thirtyeight_a, declarations.thirtyeight_a_details),
            toTinyInt(declarations.thirtyeight_b),
            detailTextValue(declarations.thirtyeight_b, declarations.thirtyeight_b_details),
            toTinyInt(declarations.thirtynine),
            detailTextValue(declarations.thirtynine, declarations.thirtynine_details),
            toTinyInt(declarations.forty_a),
            detailTextValue(declarations.forty_a, declarations.forty_a_details),
            toTinyInt(declarations.forty_b),
            detailTextValue(declarations.forty_b, declarations.forty_b_details),
            toTinyInt(declarations.forty_c),
            detailTextValue(declarations.forty_c, declarations.forty_c_details)
          ]);
          console.log(`✅ [PdsDtrChecker] Saved declarations record`);
        }

        // Save government IDs - update if replace flag is triggered OR if no existing record
        if (government_ids && government_ids.length > 0) {
          // Check if there are existing government ID records
          const [existingGovIds] = await connection.execute(
            'SELECT * FROM employee_govid WHERE emp_objid = ? ORDER BY created_at DESC LIMIT 1',
            [employeeObjId]
          );
          
          const hasExistingRecord = existingGovIds.length > 0;
          const shouldUpdate = is_replacing_gov_id || !hasExistingRecord;
          
          console.log(`🔍 [Backend] Government ID save decision:`, {
            hasExistingRecord,
            is_replacing_gov_id,
            shouldUpdate,
            government_ids_count: government_ids.length
          });
          
          if (shouldUpdate) {
            console.log(`🔍 [Backend] Processing government ID changes (${hasExistingRecord ? 'replacing existing' : 'creating new'})`);
            console.log(`🔍 [Backend] Received government_ids:`, government_ids);
            
            // Check if the government_ids actually contain meaningful data
            const hasValidData = government_ids.some(id => 
              (id.government_issued_id && id.government_issued_id.trim() !== '') ||
              (id.id_number && id.id_number.trim() !== '')
            );
            
            if (hasValidData) {
              // For existing records, check if there are actual changes
              let hasChanges = true; // Default to true for new records
              if (hasExistingRecord) {
                const existing = existingGovIds[0];
                const newGovId = government_ids[0]; // Assuming only one government ID
                
                // Normalize both dates for comparison
                const normalizedNewDate = normalizeDate(newGovId.date_issued) || '';
                const normalizedExistingDate = existing.gov_id_dateissued ? 
                  (existing.gov_id_dateissued instanceof Date ? 
                    existing.gov_id_dateissued.toISOString().split('T')[0] : 
                    normalizeDate(existing.gov_id_dateissued)) : '';
                
                // Compare each field
                const fieldsChanged = (
                  (existing.gov_id || '') !== (newGovId.government_issued_id || '') ||
                  (existing.gov_id_number || '') !== (newGovId.id_number || '') ||
                  normalizedExistingDate !== normalizedNewDate ||
                  (existing.gov_id_placeissued || '') !== (newGovId.place_of_issuance || '')
                );
                
                hasChanges = fieldsChanged;
              }
              
              // Only update if there are actual changes (or if it's a new record)
              if (hasChanges) {
                try {
                  // Try to deactivate existing records (in case status column exists)
                  await connection.execute('UPDATE employee_govid SET status = "inactive" WHERE emp_objid = ?', [employeeObjId]);
                } catch (error) {
                  // If status column doesn't exist, just delete existing records
                  console.log('🔍 [Backend] Status column may not exist, deleting existing records instead');
                  await connection.execute('DELETE FROM employee_govid WHERE emp_objid = ?', [employeeObjId]);
                }
                
                // Insert new government ID record
                for (const govId of government_ids) {
                  if (govId.government_issued_id || govId.id_number) {
                    try {
                      // Try to insert with correct database field names
                      await connection.execute(`
                        INSERT INTO employee_govid (
                          objid, emp_objid, gov_id, gov_id_number, 
                          gov_id_dateissued, gov_id_placeissued, status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                      `, [
                        uuidv4(), employeeObjId,
                        govId.government_issued_id || null,
                        govId.id_number || null,
                        normalizeDate(govId.date_issued) || null,
                        govId.place_of_issuance || null,
                        'active' // Mark as active
                      ]);
                    } catch (error) {
                      // If status column doesn't exist, insert without it
                      console.log('🔍 [Backend] Status column may not exist, inserting without status');
                      await connection.execute(`
                        INSERT INTO employee_govid (
                          objid, emp_objid, gov_id, gov_id_number, 
                          gov_id_dateissued, gov_id_placeissued, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                      `, [
                        uuidv4(), employeeObjId,
                        govId.government_issued_id || null,
                        govId.id_number || null,
                        normalizeDate(govId.date_issued) || null,
                        govId.place_of_issuance || null
                      ]);
                    }
                  }
                }
                console.log(`✅ [PdsDtrChecker] Updated government ID records (changes detected)`);
              } else {
                console.log(`✅ [PdsDtrChecker] Government ID records unchanged, skipping update`);
              }
            } else {
              console.log(`🔍 [Backend] No valid government ID data found, skipping update`);
            }
          } else {
            console.log(`🔍 [Backend] No changes detected - skipping government ID update`);
          }
        } else {
          console.log(`🔍 [Backend] No government IDs provided - skipping update`);
        }

        // Save references
        console.log('🔍 [Backend] Received references for saving:', references);
        if (references && references.length > 0) {
          // Delete existing references first
          await connection.execute('DELETE FROM employee_references WHERE emp_objid = ?', [employeeObjId]);
          
          // Insert new references
          for (const ref of references) {
            if (ref.reference_name && ref.reference_name.trim() !== '') {
              await connection.execute(`
                INSERT INTO employee_references (
                  objid, emp_objid, reference_name, reference_address, reference_phone, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                ref.reference_name || null,
                ref.reference_address || null,
                ref.reference_tel_no || null
              ]);
            }
          }
          console.log(`✅ [PdsDtrChecker] Saved ${references.length} reference records`);
        }

        // Set ispdsentrylock = 1 if date_accomplished is provided
        if (date_accomplished && typeof date_accomplished === 'string' && date_accomplished.trim() !== '') {
          await connection.execute(
            'UPDATE employees SET ispdsentrylock = 1 WHERE objid = ?',
            [employeeObjId]
          );
          console.log(`✅ [PdsDtrChecker] Set ispdsentrylock = 1 for employee ${employeeObjId} (date_accomplished provided)`);
        }

        await connection.query('COMMIT');
        connection.release();

        console.log(`✅ [PdsDtrChecker] PDS saved successfully for user ${userId}`);
        res.json({ success: true, message: 'PDS saved successfully' });

      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ [PdsDtrChecker] Error saving PDS:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save PDS data',
      error: error.message 
    });
  }
};

// GET /api/pds-dtrchecker/lookup - Get lookup data (combined endpoint)
export const getLookupData = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    console.log('🔄 [PdsDtrChecker] Fetching lookup data...');
    
    // Add connection timeout
    const connection = await pool.getConnection();
    connection.config.connectTimeout = 5000;
    
    try {
      // Fetch all lookup data in optimized queries
      const [bloodTypes] = await connection.execute(
        'SELECT id, blood_type FROM blood_types ORDER BY id ASC'
      );
      
      const [civilStatuses] = await connection.execute(
        'SELECT id, civil_status FROM civilstatus ORDER BY id ASC'
      );
      
      const [eligibilityTypes] = await connection.execute(
        'SELECT id, careertypes FROM eligibilitytypes ORDER BY careertypes ASC'
      );
      
      connection.release();
      
      console.log(`✅ [PdsDtrChecker] Fetched ${bloodTypes.length} blood types, ${civilStatuses.length} civil statuses, ${eligibilityTypes.length} eligibility types`);
      
      // Map eligibility types to match frontend expectations
      const mappedEligibilityTypes = eligibilityTypes.map(item => ({
        id: item.id,
        eligibility_type: item.careertypes
      }));

      res.json({
        success: true,
        data: {
          bloodTypes,
          civilStatuses,
          eligibilityTypes: mappedEligibilityTypes
        }
      });
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('❌ [PdsDtrChecker] Error fetching lookup data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch lookup data',
      error: error.message 
    });
  }
};

// GET /api/pds-dtrchecker/missing-fields - Get missing fields for current user
export const getMissingFieldsForCurrentUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const userId = req.user.USERID;
    
    console.log(`🔍 [PdsDtrChecker] Getting missing fields for user ID: ${userId}`);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in authentication context'
      });
    }

    const connection = await pool.getConnection();
    connection.config.connectTimeout = 5000;

    try {
      // Get employee objid from dtruserid (normalize for string/padded columns)
      const [employees] = await connection.execute(
        'SELECT objid FROM employees WHERE TRIM(CAST(dtruserid AS CHAR)) = ? LIMIT 1',
        [String(userId)]
      );

      if (employees.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }

      const employeeObjId = employees[0].objid;
      console.log(`🔍 [PdsDtrChecker] Employee objid: ${employeeObjId}`);

      // Get all PDS data for missing fields calculation
      const [employeeData] = await connection.execute(
        'SELECT * FROM employees WHERE objid = ? LIMIT 1',
        [employeeObjId]
      );

      const [childrenData] = await connection.execute(
        'SELECT * FROM employee_childrens WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [educationData] = await connection.execute(
        'SELECT * FROM employee_education WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [eligibilityData] = await connection.execute(
        'SELECT * FROM employee_eligibility WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [workData] = await connection.execute(
        'SELECT * FROM employee_workexperience WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [voluntaryData] = await connection.execute(
        'SELECT * FROM employee_voluntary WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [trainingData] = await connection.execute(
        'SELECT * FROM employee_training WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [skillsData] = await connection.execute(
        'SELECT * FROM employee_other_info_hobies WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [recognitionData] = await connection.execute(
        'SELECT * FROM employee_other_info_recognition WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [membershipData] = await connection.execute(
        'SELECT * FROM employee_other_info_membership WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [declarationData] = await connection.execute(
        'SELECT * FROM employee_declaration WHERE emp_objid = ? LIMIT 1',
        [employeeObjId]
      );

      const [referenceData] = await connection.execute(
        'SELECT * FROM employee_references WHERE emp_objid = ?',
        [employeeObjId]
      );

      const [governmentIdData] = await connection.execute(
        'SELECT * FROM employee_govid WHERE emp_objid = ? AND status = "active" LIMIT 1',
        [employeeObjId]
      );

      const [mediaData] = await connection.execute(
        'SELECT * FROM employees_media WHERE emp_objid = ? LIMIT 1',
        [employeeObjId]
      );

      // Helper function to check if field is empty
      const isEmpty = (value) => {
        return value === null || value === undefined || value === '' || 
               (typeof value === 'string' && value.trim() === '');
      };

      // Helper function to add missing field
      const missingFields = [];
      const addMissingField = (fieldName, section, key, page, focusSelector = null) => {
        missingFields.push({
          field: fieldName,
          section: section,
          key: key,
          page: page,
          focusSelector: focusSelector
        });
      };

      const employee = employeeData[0] || {};
      
      // Debug: Check specific fields that are showing as missing
      console.log('🔍 [Missing Fields Debug] Employee fields being checked:', {
        surname: employee.surname,
        firstname: employee.firstname,
        birthdate: employee.birthdate,
        birthplace: employee.birthplace,
        gender: employee.gender,
        civil_status: employee.civil_status
      });

      // Page 1 - Personal Information (using correct database field names)
      console.log('🔍 [Missing Fields Debug] isEmpty checks:', {
        surname: isEmpty(employee.surname),
        firstname: isEmpty(employee.firstname),
        birthdate: isEmpty(employee.birthdate),
        birthplace: isEmpty(employee.birthplace),
        gender: isEmpty(employee.gender),
        civil_status: isEmpty(employee.civil_status)
      });
      
      if (isEmpty(employee.surname)) addMissingField('Surname', 'Personal Information', 'surname', 1, 'surname');
      if (isEmpty(employee.firstname)) addMissingField('First Name', 'Personal Information', 'firstname', 1, 'firstname');
      if (isEmpty(employee.middlename)) addMissingField('Middle Name', 'Personal Information', 'middlename', 1, 'middlename');
      if (isEmpty(employee.birthdate)) addMissingField('Date of Birth', 'Personal Information', 'date_of_birth', 1, 'date_of_birth');
      if (isEmpty(employee.birthplace)) addMissingField('Place of Birth', 'Personal Information', 'place_of_birth', 1, 'place_of_birth');
      if (isEmpty(employee.gender)) addMissingField('Sex', 'Personal Information', 'sex', 1, 'sex');
      if (isEmpty(employee.civil_status)) addMissingField('Civil Status', 'Personal Information', 'civil_status', 1, 'civil_status');
      if (isEmpty(employee.height)) addMissingField('Height', 'Personal Information', 'height', 1, 'height');
      if (isEmpty(employee.weight)) addMissingField('Weight', 'Personal Information', 'weight', 1, 'weight');
      if (isEmpty(employee.blood_type)) addMissingField('Blood Type', 'Personal Information', 'blood_type', 1, 'blood_type');

      // Page 1 - Address Information (check employee_address table)
      const [addresses] = await connection.execute(
        'SELECT * FROM employee_address WHERE emp_objid = ?',
        [employeeObjId]
      );
      
      const address = addresses.length > 0 ? addresses[0] : {};
      console.log('🔍 [Missing Fields Debug] Address isEmpty checks:', {
        resi_house: isEmpty(address.resi_house),
        resi_street: isEmpty(address.resi_street),
        resi_barangay: isEmpty(address.resi_barangay),
        resi_city: isEmpty(address.resi_city),
        resi_province: isEmpty(address.resi_province),
        resi_zip: isEmpty(address.resi_zip)
      });
      
      if (isEmpty(address.resi_house)) addMissingField('House/Block/Lot No.', 'Residential Address', 'residential_house_block_lot', 1);
      if (isEmpty(address.resi_street)) addMissingField('Street', 'Residential Address', 'residential_street', 1);
      if (isEmpty(address.resi_barangay)) addMissingField('Barangay', 'Residential Address', 'residential_barangay', 1);
      if (isEmpty(address.resi_city)) addMissingField('City/Municipality', 'Residential Address', 'residential_city_municipality', 1);
      if (isEmpty(address.resi_province)) addMissingField('Province', 'Residential Address', 'residential_province', 1);
      if (isEmpty(address.resi_zip)) addMissingField('ZIP Code', 'Residential Address', 'residential_zip_code', 1);

      // Page 1 - Contact Information
      if (isEmpty(employee.mobile)) addMissingField('Mobile Number', 'Contact Information', 'mobile', 1);
      if (isEmpty(employee.email)) addMissingField('Email Address', 'Contact Information', 'email', 1);

      // Page 2 - Family Background (check employee_spouses table)
      const [spouses] = await connection.execute(
        'SELECT * FROM employee_spouses WHERE emp_objid = ?',
        [employeeObjId]
      );
      
      const spouse = spouses.length > 0 ? spouses[0] : {};
      console.log('🔍 [Missing Fields Debug] Spouse isEmpty checks:', {
        spouse_surname: isEmpty(spouse.spouse_surname),
        spouse_firstname: isEmpty(spouse.spouse_firstname)
      });
      
      if (isEmpty(spouse.spouse_surname)) addMissingField('Spouse Surname', 'Family Background', 'spouse_surname', 2);
      if (isEmpty(spouse.spouse_firstname)) addMissingField('Spouse First Name', 'Family Background', 'spouse_firstname', 2);
      if (isEmpty(employee.father_surname)) addMissingField('Father Surname', 'Family Background', 'father_surname', 2);
      if (isEmpty(employee.father_firstname)) addMissingField('Father First Name', 'Family Background', 'father_firstname', 2);
      if (isEmpty(employee.mother_surname)) addMissingField('Mother Surname', 'Family Background', 'mother_surname', 2);
      if (isEmpty(employee.mother_firstname)) addMissingField('Mother First Name', 'Family Background', 'mother_firstname', 2);

      // Page 2 - Children (check for meaningful data)
      const hasChildrenData = childrenData.length > 0 && childrenData.some(child => 
        (child.name && child.name.trim() !== '') || 
        (child.dateofbirth && child.dateofbirth !== null)
      );
      
      if (!hasChildrenData) {
        addMissingField('Children Information', 'Children', 'children', 2, 'children-section');
      }

      // Page 2 - Education (check for complete records)
      if (educationData.length === 0) {
        addMissingField('Education Information', 'Education', 'education', 2, 'education-section');
      } else {
        // Check if any row is complete (all required fields filled)
        const hasCompleteRow = educationData.some(edu => {
          const hasRequiredFields = 
            edu.school_name && typeof edu.school_name === 'string' && edu.school_name.trim() !== '' &&
            edu.course && typeof edu.course === 'string' && edu.course.trim() !== '' &&
            edu.from && edu.from !== null && // Date object, not string
            edu.to && edu.to !== null && // Date object, not string
            edu.highest_level && typeof edu.highest_level === 'string' && edu.highest_level.trim() !== '' &&
            edu.year_graduated && edu.year_graduated !== null; // Date object, not string
          return hasRequiredFields;
        });
        
        
        if (!hasCompleteRow) {
          addMissingField('Education Information (Complete row required)', 'Education', 'education', 2, 'education-section');
        }
      }

      // Page 2 - Eligibility (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Eligibility data:', eligibilityData);
      console.log('🔍 [Missing Fields Debug] Eligibility data length:', eligibilityData.length);
      if (eligibilityData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First eligibility record:', eligibilityData[0]);
        console.log('🔍 [Missing Fields Debug] Eligibility record keys:', Object.keys(eligibilityData[0]));
      }
      
      const hasEligibilityData = eligibilityData.length > 0 && eligibilityData.some(elig => 
        (elig.eligibility_type && elig.eligibility_type.trim() !== '') || 
        (elig.rating && elig.rating.trim() !== '')
      );
      
      console.log('🔍 [Missing Fields Debug] hasEligibilityData:', hasEligibilityData);
      
      if (!hasEligibilityData) {
        addMissingField('Eligibility Information', 'Eligibility', 'eligibility', 2, 'eligibility-section');
      }

      // Page 2 - Work Experience (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Work data:', workData);
      console.log('🔍 [Missing Fields Debug] Work data length:', workData.length);
      if (workData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First work record:', workData[0]);
        console.log('🔍 [Missing Fields Debug] Work record keys:', Object.keys(workData[0]));
      }
      
      const hasWorkData = workData.length > 0 && workData.some(work => 
        (work.position && work.position.trim() !== '') || 
        (work.department_name && work.department_name.trim() !== '')
      );
      
      console.log('🔍 [Missing Fields Debug] hasWorkData:', hasWorkData);
      
      if (!hasWorkData) {
        addMissingField('Work Experience', 'Work Experience', 'workExperience', 2, 'work-experience-section');
      }

      // Page 3 - Voluntary Work (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Voluntary data:', voluntaryData);
      console.log('🔍 [Missing Fields Debug] Voluntary data length:', voluntaryData.length);
      if (voluntaryData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First voluntary record:', voluntaryData[0]);
        console.log('🔍 [Missing Fields Debug] Voluntary record keys:', Object.keys(voluntaryData[0]));
      }
      
      const hasVoluntaryData = voluntaryData.length > 0 && voluntaryData.some(vol => 
        (vol.org_address && vol.org_address.trim() !== '') || 
        (vol.position_of_work && vol.position_of_work.trim() !== '')
      );
      
      console.log('🔍 [Missing Fields Debug] hasVoluntaryData:', hasVoluntaryData);
      
      if (!hasVoluntaryData) {
        addMissingField('Voluntary Work', 'Voluntary Work', 'voluntaryWork', 3, 'voluntary-work-section');
      }

      // Page 3 - Training (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Training data:', trainingData);
      console.log('🔍 [Missing Fields Debug] Training data length:', trainingData.length);
      if (trainingData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First training record:', trainingData[0]);
        console.log('🔍 [Missing Fields Debug] Training record keys:', Object.keys(trainingData[0]));
      }
      
      const hasTrainingData = trainingData.length > 0 && trainingData.some(train => 
        (train.title && train.title.trim() !== '') || 
        (train.conducted && train.conducted.trim() !== '')
      );
      
      console.log('🔍 [Missing Fields Debug] hasTrainingData:', hasTrainingData);
      
      if (!hasTrainingData) {
        addMissingField('Training Records', 'Training', 'trainings', 3, 'training-section');
      }

      // Page 3 - Skills (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Skills data:', skillsData);
      console.log('🔍 [Missing Fields Debug] Skills data length:', skillsData.length);
      if (skillsData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First skills record:', skillsData[0]);
        console.log('🔍 [Missing Fields Debug] Skills record keys:', Object.keys(skillsData[0]));
      }
      
      const hasSkillsData = skillsData.length > 0 && skillsData.some(skill => 
        skill.skills_hobbies && skill.skills_hobbies.trim() !== ''
      );
      
      console.log('🔍 [Missing Fields Debug] hasSkillsData:', hasSkillsData);
      
      if (!hasSkillsData) {
        addMissingField('Skills and Hobbies', 'Skills', 'skills', 3, 'skills-section');
      }

      // Page 3 - Recognition (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Recognition data:', recognitionData);
      console.log('🔍 [Missing Fields Debug] Recognition data length:', recognitionData.length);
      if (recognitionData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First recognition record:', recognitionData[0]);
        console.log('🔍 [Missing Fields Debug] Recognition record keys:', Object.keys(recognitionData[0]));
      }
      
      const hasRecognitionData = recognitionData.length > 0 && recognitionData.some(rec => 
        rec.recognition && rec.recognition.trim() !== ''
      );
      
      console.log('🔍 [Missing Fields Debug] hasRecognitionData:', hasRecognitionData);
      
      if (!hasRecognitionData) {
        addMissingField('Recognition Records', 'Recognition', 'recognitions', 3, 'recognition-section');
      }

      // Page 3 - Membership (check for meaningful data)
      console.log('🔍 [Missing Fields Debug] Membership data:', membershipData);
      console.log('🔍 [Missing Fields Debug] Membership data length:', membershipData.length);
      if (membershipData.length > 0) {
        console.log('🔍 [Missing Fields Debug] First membership record:', membershipData[0]);
        console.log('🔍 [Missing Fields Debug] Membership record keys:', Object.keys(membershipData[0]));
      }
      
      const hasMembershipData = membershipData.length > 0 && membershipData.some(mem => 
        mem.membership && mem.membership.trim() !== ''
      );
      
      console.log('🔍 [Missing Fields Debug] hasMembershipData:', hasMembershipData);
      
      if (!hasMembershipData) {
        addMissingField('Membership Records', 'Membership', 'memberships', 3, 'membership-section');
      }

      // Page 4 - Declarations (check for meaningful data)
      if (declarationData.length === 0) {
        addMissingField('Declarations', 'Declarations', 'declarations', 4, 'declarations-section');
      }

      // Page 4 - References (check for exactly 3 records with meaningful data)
      if (referenceData.length < 3 || 
          referenceData.filter(ref => ref.reference_name && ref.reference_name.trim() !== '').length < 3) {
        addMissingField('Character References (3 required)', 'References', 'references', 4, 'references-section');
      }

      // Page 4 - Government ID (check for meaningful data)
      if (governmentIdData.length === 0 || !governmentIdData.some(gov => 
        gov.gov_id && gov.gov_id.trim() !== ''
      )) {
        addMissingField('Government ID', 'Government ID', 'governmentIds', 4, 'government-id-section');
      }

      // Page 4 - Media
      if (mediaData.length === 0) {
        addMissingField('Signature, Photo & Thumbmark', 'Media', 'media', 4, 'media-section');
      } else {
        const media = mediaData[0];
        if (isEmpty(media.signature_path)) addMissingField('Signature', 'Media', 'signature', 4, 'signature-section');
        if (isEmpty(media.photo_path)) addMissingField('Photo', 'Media', 'photo', 4, 'photo-section');
        if (isEmpty(media.thumb_path)) addMissingField('Thumbmark', 'Media', 'thumbmark', 4, 'thumbmark-section');
        if (isEmpty(media.date_accomplished)) addMissingField('Date Accomplished', 'Media', 'dateAccomplished', 4, 'date-accomplished');
      }

      // Group missing fields by page and section
      const groupedMissingFields = missingFields.reduce((acc, field) => {
        if (!acc[field.page]) {
          acc[field.page] = {};
        }
        if (!acc[field.page][field.section]) {
          acc[field.page][field.section] = [];
        }
        acc[field.page][field.section].push(field);
        return acc;
      }, {});

      console.log(`✅ [PdsDtrChecker] Found ${missingFields.length} missing fields`);

      res.json({
        success: true,
        missingFields: groupedMissingFields,
        totalMissing: missingFields.length
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ [PdsDtrChecker] Error getting missing fields:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving missing fields',
      error: error.message
    });
  }
};
