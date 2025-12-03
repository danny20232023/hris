import { getHR201Pool } from '../config/hr201Database.js';
import { checkPermission } from '../middleware/rbacMiddleware.js';
import { updateTravel } from './201EmployeeTravelsController.js';
import { updateCdoStatus } from './DTREmployeecdoController.js';
import { updateLocator } from './201EmployeeLocatorController.js';
import { updateLeaveTransaction } from './201employeeLeaveTransactionsController.js';
import { updateOTTransactionStatus } from './DTREmployeeOTController.js';
import { approveFixChecktime, cancelFixChecktime } from './DTRFixChecktimeController.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';

// Map transaction types to component names
const getComponentName = (type) => {
  const typeMap = {
    'travel': '201-travel',
    'cdo': 'dtr-cdo',
    'locator': '201-locator',
    'leave': '201-leave',
    'fixlog': 'dtr-fix-checktimes',
    'overtime': 'dtr-ot-transactions'
  };
  return typeMap[type.toLowerCase()] || null;
};

// Get all pending approvals that user has permissions for
export const getAllPendingApprovals = async (req, res) => {
  const pool = getHR201Pool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    const userId = req.user?.USERID || req.user?.id;
    const usertype = req.user?.usertype || req.user?.usertype_id;
    
    if (!userId || !usertype) {
      if (connection) connection.release();
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Root Admin bypass - sysusers.id = 1 can see all transactions
    const isRootAdmin = Number(userId) === 1 || userId === '1';
    
    const allApprovals = [];
    
    // Helper function to check if user has any approval permission for a component
    const hasApprovalPermission = async (componentName) => {
      // Root admin bypass - always return true
      if (isRootAdmin) return true;
      
      const canApprove = await checkPermission(req, componentName, 'approve');
      const canReturn = await checkPermission(req, componentName, 'return');
      const canCancel = await checkPermission(req, componentName, 'cancel');
      return canApprove || canReturn || canCancel;
    };

    // Helper function to get permission flags (with root admin bypass)
    const getPermissionFlags = async (componentName) => {
      try {
        if (isRootAdmin) {
          // Root admin has all permissions
          return {
            canApprove: true,
            canReturn: true,
            canCancel: true
          };
        }
        // Check permissions individually with error handling
        let canApprove = false;
        let canReturn = false;
        let canCancel = false;
        
        try {
          canApprove = await checkPermission(req, componentName, 'approve');
        } catch (e) {
          console.warn(`[AdminApproval] Error checking approve permission for ${componentName}:`, e.message);
        }
        
        try {
          canReturn = await checkPermission(req, componentName, 'return');
        } catch (e) {
          console.warn(`[AdminApproval] Error checking return permission for ${componentName}:`, e.message);
        }
        
        try {
          canCancel = await checkPermission(req, componentName, 'cancel');
        } catch (e) {
          console.warn(`[AdminApproval] Error checking cancel permission for ${componentName}:`, e.message);
        }
        
        return {
          canApprove: canApprove === true || canApprove === 1,
          canReturn: canReturn === true || canReturn === 1,
          canCancel: canCancel === true || canCancel === 1
        };
      } catch (permError) {
        console.error(`[AdminApproval] Error getting permission flags for ${componentName}:`, permError);
        // Return default permissions (all false) on error
        return {
          canApprove: false,
          canReturn: false,
          canCancel: false
        };
      }
    };
    
    // 1. Travels
    if (await hasApprovalPermission('201-travel')) {
      try {
        const [travels] = await connection.execute(`
        SELECT 
          t.objid as id,
          'travel' as type,
          t.travelno,
          t.purpose,
          t.traveldestination,
          t.travelstatus as status,
          t.createddate,
          t.createdby,
          t.isportal,
          MIN(etd.traveldate) as start_date,
          MAX(etd.traveldate) as end_date,
          (SELECT GROUP_CONCAT(DISTINCT etd3.traveldate ORDER BY etd3.traveldate SEPARATOR ',')
           FROM employee_travels_dates etd3 
           WHERE etd3.travel_objid = t.objid) as all_travel_dates,
          (SELECT GROUP_CONCAT(DISTINCT CONCAT(e2.objid, '|', e2.surname, '|', e2.firstname, '|', COALESCE(e2.middlename, ''), '|', COALESCE(em2.photo_path, '')) SEPARATOR '||')
           FROM employee_travels_dates etd2 
           LEFT JOIN employees e2 ON etd2.emp_objid = e2.objid 
           LEFT JOIN employees_media em2 ON e2.objid = em2.emp_objid 
           WHERE etd2.travel_objid = t.objid) as all_employees_data,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_travels t
        LEFT JOIN employee_travels_dates etd ON t.objid = etd.travel_objid
        LEFT JOIN employees e ON etd.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN sysusers cb ON t.createdby = cb.id AND (t.isportal = 0 OR t.isportal IS NULL)
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = t.createdby AND t.isportal = 1
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE t.travelstatus = 'For Approval'
        GROUP BY t.objid, t.travelno, t.purpose, t.traveldestination, t.travelstatus, t.createddate, t.createdby, t.isportal, cb.photo, cb.username, ce.surname, ce.firstname, ce.middlename, ce.objid, cem.photo_path, ce_portal.objid, cem_portal.photo_path
        ORDER BY t.createddate DESC
      `);
      
      for (const travel of travels) {
        // Get all employees from all_employees_data
        // Format: objid|surname|firstname|middlename|photo_path||objid|surname|...
        let employees = [];
        if (travel.all_employees_data) {
          const employeeStrings = travel.all_employees_data.split('||');
          for (const empStr of employeeStrings) {
            const parts = empStr.split('|');
            if (parts.length >= 5) {
              let employee = {
                objid: parts[0],
                surname: parts[1] || '',
                firstname: parts[2] || '',
                middlename: parts[3] || '',
                photo: parts[4] || null
              };
              // Load photo if path exists
              if (employee.photo && employee.objid) {
                try {
                  employee.photo = await readMediaAsBase64(employee.photo, employee.objid, 'photo');
                } catch (e) {
                  employee.photo = null;
                }
              }
              employees.push(employee);
            }
          }
        }
        // Keep first employee for backward compatibility
        const employee = employees.length > 0 ? employees[0] : { objid: null, surname: '', firstname: '', middlename: '', photo: null };
        
        // Get created_by photo - check if portal user
        let createdByPhoto = null;
        const isPortal = travel.isportal === 1 || travel.isportal === '1';
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (travel.created_by_portal_photo_path && travel.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(travel.created_by_portal_photo_path, travel.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (travel.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(travel.created_by_photo_blob) 
                ? travel.created_by_photo_blob 
                : Buffer.from(travel.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (travel.created_by_photo_path && travel.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(travel.created_by_photo_path, travel.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const travelPermissions = await getPermissionFlags('201-travel');
        
        // Parse all travel dates
        let travelDates = [];
        if (travel.all_travel_dates) {
          travelDates = travel.all_travel_dates.split(',').map(date => date.trim()).filter(Boolean);
        }
        
        allApprovals.push({
          id: travel.id,
          type: 'travel',
          typeLabel: 'Travel',
          employee: employee, // First employee for backward compatibility
          employees: employees, // All employees array
          details: {
            travelNo: travel.travelno || null,
            purpose: travel.purpose,
            destination: travel.traveldestination,
            travelDates: travelDates,
            startDate: travel.start_date ? new Date(travel.start_date).toISOString().split('T')[0] : null,
            endDate: travel.end_date ? new Date(travel.end_date).toISOString().split('T')[0] : null
          },
          status: travel.status,
          createdDate: travel.createddate,
          createdBy: {
            photo: createdByPhoto,
            username: travel.created_by_username,
            isPortal: isPortal
          },
          ...travelPermissions
        });
      }
      } catch (error) {
        console.error('Error fetching travels:', error);
        // Continue with other transaction types
      }
    }
    
    // 2. CDO
    const hasCdoPermission = await hasApprovalPermission('dtr-cdo');
    console.log(`[AdminApproval] CDO permission check: ${hasCdoPermission} for component 'dtr-cdo'`);
    
    if (hasCdoPermission) {
      try {
        // First, check what statuses exist in the database
        const [statusCheck] = await connection.execute(`
          SELECT DISTINCT cdostatus, COUNT(*) as count 
          FROM employee_cdo 
          GROUP BY cdostatus
        `);
        console.log('[AdminApproval] CDO statuses in database:', JSON.stringify(statusCheck, null, 2));
        
        // Check total count
        const [totalCount] = await connection.execute(`
          SELECT COUNT(*) as total FROM employee_cdo
        `);
        console.log(`[AdminApproval] Total CDOs in database: ${totalCount[0]?.total || 0}`);
        
        const [cdos] = await connection.execute(`
        SELECT 
          c.id,
          'cdo' as type,
          c.cdotitle,
          c.cdopurpose,
          c.cdostatus as status,
          c.createddate,
          c.createdby,
          c.emp_objid,
          e.firstname,
          e.surname,
          e.middlename,
          em.photo_path,
          MIN(cd.cdoworkdate) as start_date,
          MAX(cd.cdoworkdate) as end_date,
          (SELECT GROUP_CONCAT(DISTINCT cd2.cdoworkdate ORDER BY cd2.cdoworkdate SEPARATOR ',')
           FROM employee_cdo_workdates cd2 
           WHERE cd2.cdo_id = c.id) as all_work_dates,
          COALESCE(MAX(c.isportal), 0) as isportal,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_cdo c
        LEFT JOIN employee_cdo_workdates cd ON c.id = cd.cdo_id
        LEFT JOIN employees e ON c.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN sysusers cb ON c.createdby = cb.id
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = c.createdby
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE (
          UPPER(TRIM(COALESCE(c.cdostatus, ''))) = 'FOR APPROVAL' 
          OR c.cdostatus IS NULL 
          OR TRIM(COALESCE(c.cdostatus, '')) = ''
        )
        GROUP BY c.id, c.cdotitle, c.cdopurpose, c.cdostatus, c.createddate, c.createdby, c.emp_objid, e.firstname, e.surname, e.middlename, em.photo_path, cb.photo, cb.username, ce.surname, ce.firstname, ce.middlename, ce.objid, cem.photo_path, ce_portal.objid, cem_portal.photo_path
        ORDER BY c.createddate DESC
      `);
      
      console.log(`[AdminApproval] Found ${cdos.length} CDOs pending approval`);
      
      for (const cdo of cdos) {
        console.log(`[AdminApproval] Processing CDO ${cdo.id}, status: ${cdo.status}`);
        // Load employee photo
        let employeePhoto = null;
        if (cdo.photo_path && cdo.emp_objid) {
          try {
            employeePhoto = await readMediaAsBase64(cdo.photo_path, cdo.emp_objid, 'photo');
          } catch (e) {
            employeePhoto = null;
          }
        }
        
        // Get created_by photo - check if portal user
        let createdByPhoto = null;
        const isPortal = cdo.isportal === 1 || cdo.isportal === '1';
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (cdo.created_by_portal_photo_path && cdo.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(cdo.created_by_portal_photo_path, cdo.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (cdo.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(cdo.created_by_photo_blob) 
                ? cdo.created_by_photo_blob 
                : Buffer.from(cdo.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (cdo.created_by_photo_path && cdo.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(cdo.created_by_photo_path, cdo.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const cdoPermissions = await getPermissionFlags('dtr-cdo');
        console.log(`[AdminApproval] CDO ${cdo.id} permissions:`, cdoPermissions);
        
        // Parse all work dates
        let workDates = [];
        if (cdo.all_work_dates) {
          workDates = cdo.all_work_dates.split(',').map(date => date.trim()).filter(Boolean);
        }
        
        allApprovals.push({
          id: cdo.id,
          type: 'cdo',
          typeLabel: 'CDO',
          employee: {
            objid: cdo.emp_objid,
            surname: cdo.surname || '',
            firstname: cdo.firstname || '',
            middlename: cdo.middlename || '',
            photo: employeePhoto
          },
          details: {
            title: cdo.cdotitle,
            purpose: cdo.cdopurpose || null,
            workDates: workDates,
            startDate: cdo.start_date ? new Date(cdo.start_date).toISOString().split('T')[0] : null,
            endDate: cdo.end_date ? new Date(cdo.end_date).toISOString().split('T')[0] : null
          },
          status: cdo.status,
          createdDate: cdo.createddate,
          createdBy: {
            photo: createdByPhoto,
            username: cdo.created_by_username,
            isPortal: isPortal
          },
          ...cdoPermissions
        });
        console.log(`[AdminApproval] CDO ${cdo.id} added to approvals`);
      }
      
      console.log(`[AdminApproval] Successfully processed ${cdos.length} CDOs, added ${allApprovals.filter(a => a.type === 'cdo').length} to approvals list`);
      } catch (error) {
        console.error('[AdminApproval] Error fetching CDOs:', error);
        console.error('[AdminApproval] Error stack:', error.stack);
        // Continue with other transaction types
      }
    }
    
    // 3. Locators
    if (await hasApprovalPermission('201-locator')) {
      try {
        const [locators] = await connection.execute(`
        SELECT 
          l.objid as id,
          'locator' as type,
          l.locpurpose,
          l.locdestination,
          l.locatordate,
          l.locstatus as status,
          l.createddate,
          l.createdby,
          l.emp_objid,
          l.isportal,
          e.firstname,
          e.surname,
          e.middlename,
          em.photo_path,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_locators l
        LEFT JOIN employees e ON l.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN sysusers cb ON l.createdby = cb.id AND (l.isportal = 0 OR l.isportal IS NULL)
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = l.createdby AND l.isportal = 1
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE l.locstatus = 'For Approval'
        ORDER BY l.createddate DESC
      `);
      
      for (const locator of locators) {
        // Load employee photo
        let employeePhoto = null;
        if (locator.photo_path && locator.emp_objid) {
          try {
            employeePhoto = await readMediaAsBase64(locator.photo_path, locator.emp_objid, 'photo');
          } catch (e) {
            employeePhoto = null;
          }
        }
        
        // Get created_by photo - check if portal user
        let createdByPhoto = null;
        const isPortal = locator.isportal === 1 || locator.isportal === '1';
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (locator.created_by_portal_photo_path && locator.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(locator.created_by_portal_photo_path, locator.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (locator.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(locator.created_by_photo_blob) 
                ? locator.created_by_photo_blob 
                : Buffer.from(locator.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (locator.created_by_photo_path && locator.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(locator.created_by_photo_path, locator.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const locatorPermissions = await getPermissionFlags('201-locator');
        
        allApprovals.push({
          id: locator.id,
          type: 'locator',
          typeLabel: 'Locator',
          employee: {
            objid: locator.emp_objid,
            surname: locator.surname || '',
            firstname: locator.firstname || '',
            middlename: locator.middlename || '',
            photo: employeePhoto
          },
          details: {
            purpose: locator.locpurpose,
            destination: locator.locdestination,
            date: locator.locatordate ? new Date(locator.locatordate).toISOString().split('T')[0] : null
          },
          status: locator.status,
          createdDate: locator.createddate,
          createdBy: {
            photo: createdByPhoto,
            username: locator.created_by_username,
            isPortal: isPortal
          },
          ...locatorPermissions
        });
      }
      } catch (error) {
        console.error('Error fetching locators:', error);
        // Continue with other transaction types
      }
    }
    
    // 4. Leaves
    if (await hasApprovalPermission('201-leave')) {
      try {
        const [leaves] = await connection.execute(`
        SELECT 
          elt.objid as id,
          'leave' as type,
          elt.leavetypeid,
          elt.deductedcredit,
          elt.leavepurpose,
          elt.leavestatus as status,
          elt.createddate,
          elt.createdby,
          elt.emp_objid,
          elt.isportal,
          e.firstname,
          e.surname,
          e.middlename,
          em.photo_path,
          MIN(eld.leavedate) as start_date,
          MAX(eld.leavedate) as end_date,
          lt.leavetype as leave_type_name,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_leave_trans elt
        LEFT JOIN employee_leave_trans_details eld ON elt.objid = eld.leave_objid
        LEFT JOIN employees e ON elt.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN leavetypes lt ON elt.leavetypeid = lt.leaveid
        LEFT JOIN sysusers cb ON elt.createdby = cb.id AND (elt.isportal = 0 OR elt.isportal IS NULL)
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = elt.createdby AND elt.isportal = 1
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE (
          UPPER(TRIM(COALESCE(elt.leavestatus, ''))) = 'FOR APPROVAL' 
          OR elt.leavestatus IS NULL 
          OR TRIM(COALESCE(elt.leavestatus, '')) = ''
        )
        GROUP BY elt.objid, elt.leavetypeid, elt.deductedcredit, elt.leavepurpose, elt.leavestatus, elt.createddate, elt.createdby, elt.emp_objid, elt.isportal, e.firstname, e.surname, e.middlename, em.photo_path, lt.leavetype, cb.photo, cb.username, ce.surname, ce.firstname, ce.middlename, ce.objid, cem.photo_path, ce_portal.objid, cem_portal.photo_path
        ORDER BY elt.createddate DESC
      `);
      
      for (const leave of leaves) {
        // Load employee photo
        let employeePhoto = null;
        if (leave.photo_path && leave.emp_objid) {
          try {
            employeePhoto = await readMediaAsBase64(leave.photo_path, leave.emp_objid, 'photo');
          } catch (e) {
            employeePhoto = null;
          }
        }
        
        // Get created_by photo - check if portal user
        let createdByPhoto = null;
        const isPortal = leave.isportal === 1 || leave.isportal === '1';
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (leave.created_by_portal_photo_path && leave.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(leave.created_by_portal_photo_path, leave.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (leave.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(leave.created_by_photo_blob) 
                ? leave.created_by_photo_blob 
                : Buffer.from(leave.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (leave.created_by_photo_path && leave.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(leave.created_by_photo_path, leave.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const leavePermissions = await getPermissionFlags('201-leave');
        
        allApprovals.push({
          id: leave.id,
          type: 'leave',
          typeLabel: 'Leave',
          employee: {
            objid: leave.emp_objid,
            surname: leave.surname || '',
            firstname: leave.firstname || '',
            middlename: leave.middlename || '',
            photo: employeePhoto
          },
          details: {
            leaveType: leave.leave_type_name,
            leaveTypeId: leave.leavetypeid,
            credits: leave.deductedcredit,
            leavePurpose: leave.leavepurpose || null,
            startDate: leave.start_date ? new Date(leave.start_date).toISOString().split('T')[0] : null,
            endDate: leave.end_date ? new Date(leave.end_date).toISOString().split('T')[0] : null
          },
          status: leave.status,
          createdDate: leave.createddate,
          createdBy: {
            photo: createdByPhoto,
            username: leave.created_by_username,
            isPortal: isPortal
          },
          ...leavePermissions
        });
      }
      } catch (error) {
        console.error('Error fetching leaves:', error);
        // Continue with other transaction types
      }
    }
    
    // 5. Fix Logs
    const hasFixLogPermission = await hasApprovalPermission('dtr-fix-checktimes');
    console.log(`[AdminApproval] Fix logs permission check: ${hasFixLogPermission} for component 'dtr-fix-checktimes'`);
    
    if (hasFixLogPermission) {
      try {
        console.log('[AdminApproval] Fetching fix logs with status: For Approval, NULL, or empty');
        
        // First, let's check what statuses actually exist in the database for debugging
        const [statusCheck] = await connection.execute(`
          SELECT DISTINCT fixstatus, COUNT(*) as count 
          FROM employee_fixchecktimes 
          GROUP BY fixstatus
        `);
        console.log('[AdminApproval] Fix log statuses in database:', JSON.stringify(statusCheck, null, 2));
        
        // Also check total count of records
        const [totalCount] = await connection.execute(`
          SELECT COUNT(*) as total FROM employee_fixchecktimes
        `);
        console.log(`[AdminApproval] Total fix logs in database: ${totalCount[0]?.total || 0}`);
        
        const [fixLogs] = await connection.execute(`
        SELECT 
          f.fixid as id,
          'fixlog' as type,
          f.checktimedate,
          f.am_checkin,
          f.am_checkout,
          f.pm_checkin,
          f.pm_checkout,
          f.remarks,
          f.fixstatus as status,
          f.createddate,
          f.createdby,
          f.emp_objid,
          e.firstname,
          e.surname,
          e.middlename,
          em.photo_path,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          cb.id as created_by_sysuser_id,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_fixchecktimes f
        LEFT JOIN employees e ON f.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN sysusers cb ON f.createdby = cb.id
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = f.createdby
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE (
          UPPER(TRIM(COALESCE(f.fixstatus, ''))) = 'FOR APPROVAL' 
          OR f.fixstatus IS NULL 
          OR TRIM(COALESCE(f.fixstatus, '')) = ''
        )
        ORDER BY f.createddate DESC
      `);
      
      console.log(`[AdminApproval] Found ${fixLogs.length} fix logs pending approval`);
      
      for (const fixLog of fixLogs) {
        try {
          console.log(`[AdminApproval] Processing fix log ${fixLog.id}`);
          // Load employee photo
          let employeePhoto = null;
          if (fixLog.photo_path && fixLog.emp_objid) {
            try {
              employeePhoto = await readMediaAsBase64(fixLog.photo_path, fixLog.emp_objid, 'photo');
            } catch (e) {
              console.warn(`[AdminApproval] Failed to load employee photo for fix log ${fixLog.id}:`, e.message);
              employeePhoto = null;
            }
          }
        
        // Get created_by photo - check if portal user
        // Note: Fix logs don't have isportal field, so we check if sysuser exists
        // If no sysuser found but employee found with dtruserid, it's likely a portal user
        let createdByPhoto = null;
        const isPortal = !fixLog.created_by_sysuser_id && fixLog.created_by_portal_emp_objid;
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (fixLog.created_by_portal_photo_path && fixLog.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(fixLog.created_by_portal_photo_path, fixLog.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (fixLog.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(fixLog.created_by_photo_blob) 
                ? fixLog.created_by_photo_blob 
                : Buffer.from(fixLog.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (fixLog.created_by_photo_path && fixLog.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(fixLog.created_by_photo_path, fixLog.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const fixLogPermissions = await getPermissionFlags('dtr-fix-checktimes');
        console.log(`[AdminApproval] Fix log ${fixLog.id} permissions:`, {
          canApprove: fixLogPermissions.canApprove,
          canReturn: fixLogPermissions.canReturn,
          canCancel: fixLogPermissions.canCancel
        });
        
        // Safely parse date
        let checkTimeDate = null;
        if (fixLog.checktimedate) {
          try {
            const dateObj = new Date(fixLog.checktimedate);
            if (!isNaN(dateObj.getTime())) {
              checkTimeDate = dateObj.toISOString().split('T')[0];
            }
          } catch (dateError) {
            console.warn(`[AdminApproval] Failed to parse checktimedate for fix log ${fixLog.id}:`, dateError.message);
          }
        }
        
        // Safely parse createdDate
        let createdDateValue = null;
        if (fixLog.createddate) {
          try {
            const dateObj = new Date(fixLog.createddate);
            if (!isNaN(dateObj.getTime())) {
              createdDateValue = dateObj;
            }
          } catch (dateError) {
            console.warn(`[AdminApproval] Failed to parse createddate for fix log ${fixLog.id}:`, dateError.message);
          }
        }
        
        const fixLogApproval = {
          id: fixLog.id,
          type: 'fixlog',
          typeLabel: 'Fix Log',
          employee: {
            objid: fixLog.emp_objid || null,
            surname: fixLog.surname || '',
            firstname: fixLog.firstname || '',
            middlename: fixLog.middlename || '',
            photo: employeePhoto
          },
          details: {
            date: checkTimeDate,
            amCheckin: fixLog.am_checkin || null,
            amCheckout: fixLog.am_checkout || null,
            pmCheckin: fixLog.pm_checkin || null,
            pmCheckout: fixLog.pm_checkout || null,
            remarks: fixLog.remarks || null
          },
          status: fixLog.status || 'For Approval',
          createdDate: createdDateValue,
          createdBy: {
            photo: createdByPhoto,
            username: fixLog.created_by_username || '',
            isPortal: isPortal
          },
          ...fixLogPermissions
        };
        
          console.log(`[AdminApproval] Fix log ${fixLog.id} added to approvals (type: ${fixLogApproval.type}, status: ${fixLogApproval.status})`);
          allApprovals.push(fixLogApproval);
        } catch (fixLogError) {
          console.error(`[AdminApproval] Error processing fix log ${fixLog.id}:`, fixLogError);
          console.error(`[AdminApproval] Fix log error stack:`, fixLogError.stack);
          // Continue with next fix log instead of crashing entire request
        }
      }
      
      console.log(`[AdminApproval] Successfully processed ${fixLogs.length} fix logs, added ${allApprovals.filter(a => a.type === 'fixlog').length} to approvals list`);
      } catch (error) {
        console.error('[AdminApproval] Error fetching fix logs:', error);
        console.error('[AdminApproval] Error stack:', error.stack);
        // Continue with other transaction types
      }
    } else {
      console.log('[AdminApproval] User does not have approval permission for fix logs (dtr-fix-checktimes)');
    }
    
    // 6. Overtime
    if (await hasApprovalPermission('dtr-ot-transactions')) {
      try {
        const [overtimes] = await connection.execute(`
        SELECT 
          ot.otid as id,
          'overtime' as type,
          ot.otno,
          ot.otdetails,
          ot.ottimefrom,
          ot.ottimeto,
          ot.otstatus as status,
          ot.createddate,
          ot.createdby,
          MIN(otd.otdate) as start_date,
          MAX(otd.otdate) as end_date,
          (SELECT GROUP_CONCAT(DISTINCT otd3.otdate ORDER BY otd3.otdate SEPARATOR ',')
           FROM employee_overtimes_dates otd3 
           WHERE otd3.otid = ot.otid) as all_ot_dates,
          ot.total_renderedtime as total_hours,
          (SELECT GROUP_CONCAT(DISTINCT CONCAT(e2.objid, '|', e2.surname, '|', e2.firstname, '|', COALESCE(e2.middlename, ''), '|', COALESCE(em2.photo_path, '')) SEPARATOR '||')
           FROM employee_overtimes_dates otd2 
           LEFT JOIN employees e2 ON otd2.emp_objid = e2.objid 
           LEFT JOIN employees_media em2 ON e2.objid = em2.emp_objid 
           WHERE otd2.otid = ot.otid) as all_employees_data,
          cb.photo as created_by_photo_blob,
          cb.username as created_by_username,
          cb.id as created_by_sysuser_id,
          ce.surname as created_by_surname,
          ce.firstname as created_by_firstname,
          ce.middlename as created_by_middlename,
          ce.objid as created_by_emp_objid,
          cem.photo_path as created_by_photo_path,
          ce_portal.objid as created_by_portal_emp_objid,
          cem_portal.photo_path as created_by_portal_photo_path
        FROM employee_overtimes ot
        LEFT JOIN employee_overtimes_dates otd ON ot.otid = otd.otid
        LEFT JOIN employees e ON otd.emp_objid = e.objid
        LEFT JOIN employees_media em ON e.objid = em.emp_objid
        LEFT JOIN sysusers cb ON ot.createdby = cb.id
        LEFT JOIN employees ce ON cb.emp_objid = ce.objid
        LEFT JOIN employees_media cem ON ce.objid = cem.emp_objid
        LEFT JOIN employees ce_portal ON ce_portal.dtruserid = ot.createdby
        LEFT JOIN employees_media cem_portal ON ce_portal.objid = cem_portal.emp_objid
        WHERE ot.otstatus = 'For Approval'
        GROUP BY ot.otid, ot.otno, ot.otdetails, ot.ottimefrom, ot.ottimeto, ot.otstatus, ot.createddate, ot.createdby, ot.total_renderedtime, cb.photo, cb.username, cb.id, ce.surname, ce.firstname, ce.middlename, ce.objid, cem.photo_path, ce_portal.objid, cem_portal.photo_path
        ORDER BY ot.createddate DESC
      `);
      
      for (const ot of overtimes) {
        // Get all employees from all_employees_data
        // Format: objid|surname|firstname|middlename|photo_path||objid|surname|...
        let employees = [];
        if (ot.all_employees_data) {
          const employeeStrings = ot.all_employees_data.split('||');
          for (const empStr of employeeStrings) {
            const parts = empStr.split('|');
            if (parts.length >= 5) {
              let employee = {
                objid: parts[0],
                surname: parts[1] || '',
                firstname: parts[2] || '',
                middlename: parts[3] || '',
                photo: parts[4] || null
              };
              // Load photo if path exists
              if (employee.photo && employee.objid) {
                try {
                  employee.photo = await readMediaAsBase64(employee.photo, employee.objid, 'photo');
                } catch (e) {
                  employee.photo = null;
                }
              }
              employees.push(employee);
            }
          }
        }
        // Keep first employee for backward compatibility
        const employee = employees.length > 0 ? employees[0] : { objid: null, surname: '', firstname: '', middlename: '', photo: null };
        
        // Get created_by photo - check if portal user
        // Note: Overtime doesn't have isportal field, so we check if sysuser exists
        // If no sysuser found but employee found with dtruserid, it's likely a portal user
        let createdByPhoto = null;
        const isPortal = !ot.created_by_sysuser_id && ot.created_by_portal_emp_objid;
        
        if (isPortal) {
          // Portal user - get photo from employees table using dtruserid
          if (ot.created_by_portal_photo_path && ot.created_by_portal_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(ot.created_by_portal_photo_path, ot.created_by_portal_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal created_by photo:', e);
            }
          }
        } else {
          // Regular sysuser
          if (ot.created_by_photo_blob) {
            try {
              const buffer = Buffer.isBuffer(ot.created_by_photo_blob) 
                ? ot.created_by_photo_blob 
                : Buffer.from(ot.created_by_photo_blob);
              if (buffer.length > 0) {
                createdByPhoto = `data:image/png;base64,${buffer.toString('base64')}`;
              }
            } catch (e) {
              console.warn('Failed to convert created_by photo blob:', e);
            }
          } else if (ot.created_by_photo_path && ot.created_by_emp_objid) {
            try {
              createdByPhoto = await readMediaAsBase64(ot.created_by_photo_path, ot.created_by_emp_objid, 'photo');
            } catch (e) {
              console.warn('Failed to load created_by photo:', e);
            }
          }
        }
        
        // Get permission flags
        const otPermissions = await getPermissionFlags('dtr-ot-transactions');
        
        // Calculate hours from ottimefrom and ottimeto
        let calculatedHours = null;
        if (ot.ottimefrom && ot.ottimeto) {
          try {
            const timeFrom = new Date(`2000-01-01T${ot.ottimefrom}`);
            const timeTo = new Date(`2000-01-01T${ot.ottimeto}`);
            // Handle case where timeTo is next day (e.g., 22:00 to 02:00)
            if (timeTo < timeFrom) {
              timeTo.setDate(timeTo.getDate() + 1);
            }
            const diffMs = timeTo - timeFrom;
            const diffHours = diffMs / (1000 * 60 * 60);
            calculatedHours = Math.round(diffHours * 100) / 100; // Round to 2 decimal places
          } catch (e) {
            console.warn(`[AdminApproval] Failed to calculate hours for OT ${ot.id}:`, e.message);
          }
        }
        
        // Parse all OT dates
        let otDates = [];
        if (ot.all_ot_dates) {
          otDates = ot.all_ot_dates.split(',').map(date => date.trim()).filter(Boolean);
        }
        
        allApprovals.push({
          id: ot.id,
          type: 'overtime',
          typeLabel: 'Overtime',
          employee: employee, // First employee for backward compatibility
          employees: employees, // All employees array
          details: {
            otNumber: ot.otno,
            otDetails: ot.otdetails || null,
            otTimeFrom: ot.ottimefrom || null,
            otTimeTo: ot.ottimeto || null,
            calculatedHours: calculatedHours,
            otDates: otDates,
            totalHours: ot.total_hours,
            startDate: ot.start_date ? new Date(ot.start_date).toISOString().split('T')[0] : null,
            endDate: ot.end_date ? new Date(ot.end_date).toISOString().split('T')[0] : null
          },
          status: ot.status,
          createdDate: ot.createddate,
          createdBy: {
            photo: createdByPhoto,
            username: ot.created_by_username,
            isPortal: isPortal
          },
          ...otPermissions
        });
      }
      } catch (error) {
        console.error('Error fetching overtimes:', error);
        // Continue with other transaction types
      }
    }
    
    // Sort by created date (newest first)
    allApprovals.sort((a, b) => {
      try {
        const dateA = a.createdDate ? new Date(a.createdDate) : new Date(0);
        const dateB = b.createdDate ? new Date(b.createdDate) : new Date(0);
        if (isNaN(dateA.getTime())) return 1; // Invalid dates go to end
        if (isNaN(dateB.getTime())) return -1;
        return dateB.getTime() - dateA.getTime();
      } catch (sortError) {
        console.warn('[AdminApproval] Error sorting approvals:', sortError);
        return 0; // Keep original order if sort fails
      }
    });
    
    // Debug: Log all transaction types in final array
    const typeCounts = {};
    allApprovals.forEach(a => {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    });
    console.log(`[AdminApproval] Final allApprovals array contains ${allApprovals.length} total approvals:`, typeCounts);
    
    // Debug: Log permission flags and positions for each type
    ['travel', 'cdo', 'locator', 'leave', 'fixlog', 'overtime'].forEach(type => {
      const items = allApprovals.filter(a => a.type === type);
      if (items.length > 0) {
        const first = items[0];
        const index = allApprovals.findIndex(a => a.id === first.id && a.type === type);
        console.log(`[AdminApproval] ${type} sample: id=${first.id}, position=${index}, createdDate=${first.createdDate}, canApprove=${first.canApprove}, canReturn=${first.canReturn}, canCancel=${first.canCancel}`);
      }
    });
    
    // No backend pagination - send all records, let frontend handle pagination
    const total = allApprovals.length;
    
    console.log(`[AdminApproval] Sending all ${total} approvals to frontend (frontend will handle pagination)`);
    
    if (connection) connection.release();
    
    res.json({
      success: true,
      data: allApprovals,
      total: total
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error fetching pending approvals:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Approve transaction
export const approveTransaction = async (req, res) => {
  try {
    const { type, id } = req.params;
    const componentName = getComponentName(type);
    
    if (!componentName) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
    
    // Check canapprove permission
    const canApprove = await checkPermission(req, componentName, 'approve');
    if (!canApprove) {
      return res.status(403).json({ success: false, message: 'You do not have permission to approve this transaction' });
    }
    
    // Create request objects for the existing update functions
    const updateReq = {
      ...req,
      params: { ...req.params, id, objid: id },
      body: { ...req.body },
      user: req.user
    };
    
    // Route to appropriate update function
    switch (type.toLowerCase()) {
      case 'travel':
        updateReq.body.travelstatus = 'Approved';
        await updateTravel(updateReq, res);
        break;
      case 'cdo':
        updateReq.body.status = 'Approved';
        await updateCdoStatus(updateReq, res);
        break;
      case 'locator':
        updateReq.body.locstatus = 'Approved';
        await updateLocator(updateReq, res);
        break;
      case 'leave':
        updateReq.body.status = 'Approved';
        await updateLeaveTransaction(updateReq, res);
        break;
      case 'fixlog':
        await approveFixChecktime(updateReq, res);
        break;
      case 'overtime':
        updateReq.body.status = 'Approved';
        await updateOTTransactionStatus(updateReq, res);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to approve transaction', error: error.message });
  }
};

// Return transaction
export const returnTransaction = async (req, res) => {
  try {
    const { type, id } = req.params;
    const componentName = getComponentName(type);
    
    if (!componentName) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
    
    // Check canreturn permission
    const canReturn = await checkPermission(req, componentName, 'return');
    if (!canReturn) {
      return res.status(403).json({ success: false, message: 'You do not have permission to return this transaction' });
    }
    
    // Create request objects for the existing update functions
    const updateReq = {
      ...req,
      params: { ...req.params, id, objid: id },
      body: { ...req.body },
      user: req.user
    };
    
    // Route to appropriate update function
    switch (type.toLowerCase()) {
      case 'travel':
        updateReq.body.travelstatus = 'Returned';
        await updateTravel(updateReq, res);
        break;
      case 'cdo':
        updateReq.body.status = 'Returned';
        await updateCdoStatus(updateReq, res);
        break;
      case 'locator':
        updateReq.body.locstatus = 'Returned';
        await updateLocator(updateReq, res);
        break;
      case 'leave':
        updateReq.body.status = 'Returned';
        await updateLeaveTransaction(updateReq, res);
        break;
      case 'fixlog':
        const poolReturn = getHR201Pool();
        const connectionReturn = await poolReturn.getConnection();
        try {
          await connectionReturn.execute(
            `UPDATE employee_fixchecktimes SET fixstatus = 'Returned', updatedby = ?, updateddate = NOW() WHERE fixid = ?`,
            [req.user?.USERID || null, id]
          );
          connectionReturn.release();
          return res.json({ success: true, message: 'Fix log returned successfully' });
        } catch (error) {
          connectionReturn.release();
          throw error;
        }
      case 'overtime':
        updateReq.body.status = 'Returned';
        await updateOTTransactionStatus(updateReq, res);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
  } catch (error) {
    console.error('Error returning transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to return transaction', error: error.message });
  }
};

// Cancel transaction
export const cancelTransaction = async (req, res) => {
  try {
    const { type, id } = req.params;
    const componentName = getComponentName(type);
    
    if (!componentName) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
    
    // Check cancancel permission
    const canCancel = await checkPermission(req, componentName, 'cancel');
    if (!canCancel) {
      return res.status(403).json({ success: false, message: 'You do not have permission to cancel this transaction' });
    }
    
    // Create request objects for the existing update functions
    const updateReq = {
      ...req,
      params: { ...req.params, id, objid: id },
      body: { ...req.body },
      user: req.user
    };
    
    // Route to appropriate update function
    switch (type.toLowerCase()) {
      case 'travel':
        updateReq.body.travelstatus = 'Cancelled';
        await updateTravel(updateReq, res);
        break;
      case 'cdo':
        updateReq.body.status = 'Cancelled';
        await updateCdoStatus(updateReq, res);
        break;
      case 'locator':
        updateReq.body.locstatus = 'Cancelled';
        await updateLocator(updateReq, res);
        break;
      case 'leave':
        updateReq.body.status = 'Cancelled';
        await updateLeaveTransaction(updateReq, res);
        break;
      case 'fixlog':
        // cancelFixChecktime sets status to 'Cancel', but we want 'Cancelled' for consistency
        const poolCancel = getHR201Pool();
        const connectionCancel = await poolCancel.getConnection();
        try {
          await connectionCancel.execute(
            `UPDATE employee_fixchecktimes SET fixstatus = 'Cancelled', updatedby = ?, updateddate = NOW() WHERE fixid = ?`,
            [req.user?.USERID || null, id]
          );
          connectionCancel.release();
          return res.json({ success: true, message: 'Fix log cancelled successfully' });
        } catch (error) {
          connectionCancel.release();
          throw error;
        }
      case 'overtime':
        updateReq.body.status = 'Cancelled';
        await updateOTTransactionStatus(updateReq, res);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }
  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel transaction', error: error.message });
  }
};

