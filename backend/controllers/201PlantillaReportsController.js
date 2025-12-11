import { getHR201Pool } from '../config/hr201Database.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// GET /api/201-plantilla-reports - Get plantilla of personnel report
export const getPlantillaReport = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    // Get active tranche
    const [activeTrancheResult] = await pool.execute(`
      SELECT tranche_id, tranche_percent, tranche, implement_year
      FROM salarytranches
      WHERE tranchestatus = 'Active'
      ORDER BY implement_year DESC, tranche_id DESC
      LIMIT 1
    `);
    
    const activeTranche = activeTrancheResult.length > 0 ? activeTrancheResult[0] : null;
    
    // Main query to get all plantilla records with employee information
    const query = `
      SELECT 
        p.id AS plantilla_id,
        p.plantilla_no,
        p.position_title,
        p.position_shortname,
        p.level,
        p.salarygrade,
        p.department_id,
        d.departmentname AS department_name,
        d.departmentshortname AS department_shortname,
        ed.stepincrement,
        ed.salary AS actual_salary,
        ed.emp_objid,
        ed.appointmentstatus,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension,
        e.blood_type,
        atp.appointmentname AS appointment_status_name,
        -- Authorized salary calculation
        CASE 
          WHEN str.rate IS NOT NULL AND active_tranche.tranche_percent IS NOT NULL AND active_tranche.tranche_percent > 0 
          THEN str.rate * (active_tranche.tranche_percent / 100)
          ELSE NULL 
        END AS authorized_salary,
        -- Years in government (sum from work experience where gov_service = 'Yes')
        COALESCE(
          (SELECT 
            SUM(
              CASE 
                WHEN we.ispresent = 1 THEN 
                  DATEDIFF(CURDATE(), we.\`from\`) / 365.25
                WHEN we.\`from\` IS NOT NULL AND we.\`to\` IS NOT NULL THEN
                  DATEDIFF(we.\`to\`, we.\`from\`) / 365.25
                ELSE 0
              END
            )
           FROM employee_workexperience we
           WHERE we.emp_objid = ed.emp_objid 
             AND we.gov_service = 'Yes'
          ), 0
        ) AS years_in_government,
        -- CSC Eligibility (concatenated)
        (SELECT GROUP_CONCAT(et.careertypes SEPARATOR ', ')
         FROM employee_eligibility ee
         LEFT JOIN eligibilitytypes et ON ee.career_service = et.id
         WHERE ee.emp_objid = ed.emp_objid
         AND et.careertypes IS NOT NULL
        ) AS csc_eligibility,
        -- Educational Attainment (course from highest level)
        (SELECT edu.course
         FROM employee_education edu
         WHERE edu.emp_objid = ed.emp_objid
         ORDER BY 
           CASE edu.level
             WHEN 'Graduate Studies' THEN 1
             WHEN 'College' THEN 2
             WHEN 'Vocational/Trade Course' THEN 3
             WHEN 'Secondary' THEN 4
             WHEN 'Elementary' THEN 5
             ELSE 6
           END
         LIMIT 1
        ) AS educational_attainment,
        -- Date of Last Promotion (most recent appointmentdate)
        (SELECT MAX(appointmentdate)
         FROM employee_designation ed_history
         WHERE ed_history.emp_objid = ed.emp_objid
        ) AS date_last_promotion,
        -- Prof of Vocation (from Vocational/Trade Course education)
        (SELECT edu.course
         FROM employee_education edu
         WHERE edu.emp_objid = ed.emp_objid
           AND edu.level = 'Vocational/Trade Course'
         LIMIT 1
        ) AS prof_of_vocation
      FROM plantilla p
      LEFT JOIN department d ON p.department_id = d.deptid
      LEFT JOIN employee_designation ed ON ed.plantilla_id = p.id AND ed.ispresent = 1
      LEFT JOIN employees e ON ed.emp_objid = e.objid
      LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
      LEFT JOIN (
        SELECT tranche_id, tranche_percent
        FROM salarytranches
        WHERE tranchestatus = 'Active'
        ORDER BY implement_year DESC, tranche_id DESC
        LIMIT 1
      ) active_tranche ON 1=1
      LEFT JOIN salarytranches_rates str ON str.tranche_id = active_tranche.tranche_id 
        AND str.salarygrade = p.salarygrade 
        AND str.stepincrement = COALESCE(ed.stepincrement, '01')
      WHERE p.islguplantilla = 1
      ORDER BY p.position_title ASC
    `;
    
    const [rows] = await pool.execute(query);
    
    // Format the data
    const formattedData = rows.map(row => {
      // Format employee name
      const employeeName = row.emp_objid 
        ? formatEmployeeName(row.surname, row.firstname, row.middlename, row.extension)
        : null;
      
      // Format SG+StepIncrement
      let sgStepIncrement = null;
      if (row.salarygrade) {
        const formattedSG = String(row.salarygrade).padStart(2, '0');
        // Default stepincrement to "01" if null or empty
        const stepIncrement = row.stepincrement || '01';
        const formattedStep = String(stepIncrement).padStart(2, '0');
        sgStepIncrement = `SG ${formattedSG}-${formattedStep}`;
      }
      
      // Format years in government
      let yearsInGovt = null;
      if (row.years_in_government && row.years_in_government > 0) {
        const years = parseFloat(row.years_in_government);
        if (years % 1 === 0) {
          yearsInGovt = `${Math.round(years)} years`;
        } else {
          yearsInGovt = `${years.toFixed(2)} years`;
        }
      }
      
      // Format date of last promotion
      let formattedPromotionDate = null;
      if (row.date_last_promotion) {
        try {
          const date = new Date(row.date_last_promotion);
          if (!isNaN(date.getTime())) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            formattedPromotionDate = `${month}/${day}/${year}`;
          }
        } catch (error) {
          console.error('Error formatting promotion date:', error);
        }
      }
      
      return {
        plantilla_id: row.plantilla_id,
        plantilla_no: row.plantilla_no || null,
        position: row.position_title || null,
        position_shortname: row.position_shortname || null,
        department_shortname: row.department_shortname || null,
        level: row.level || null,
        salarygrade: row.salarygrade || null,
        department_id: row.department_id || null,
        department_name: row.department_name || row.department_shortname || null,
        sg_step_increment: sgStepIncrement || null,
        authorized_salary: row.authorized_salary,
        actual_salary: row.actual_salary,
        employee_name: employeeName || null,
        status: row.appointment_status_name || null,
        blood_type: row.blood_type || null,
        years_in_government: yearsInGovt || null,
        csc_eligibility: row.csc_eligibility || null,
        educational_attainment: row.educational_attainment || null,
        date_last_promotion: formattedPromotionDate || null,
        prof_of_vocation: row.prof_of_vocation || null,
        title: ''
      };
    });
    
    res.json({
      success: true,
      data: formattedData,
      total: formattedData.length
    });
  } catch (error) {
    console.error('❌ Error fetching plantilla report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plantilla report',
      error: error.message
    });
  }
};

