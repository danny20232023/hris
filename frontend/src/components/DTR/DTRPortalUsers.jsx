import React, { useState, useMemo, useEffect } from 'react';
import api from '../../utils/api';
import DTRPortalFormModal from './DTRPortalFormModal';
import { usePermissions } from '../../hooks/usePermissions';
import { getAppointmentName } from '../../utils/appointmentLookup';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

function DTRPortalUsers({ onRefresh }) {
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'portal-users';
  const portalPermissions = useMemo(() => ({
    read: can(COMPONENT_ID, 'read'),
    create: can(COMPONENT_ID, 'create'),
    update: can(COMPONENT_ID, 'update'),
    delete: can(COMPONENT_ID, 'delete'),
    print: can(COMPONENT_ID, 'print'),
    approve: can(COMPONENT_ID, 'approve')
  }), [can]);

  const {
    read: canReadPortalUsers,
    create: canCreatePortalUsers,
    update: canUpdatePortalUsers,
    delete: canDeletePortalUsers,
    print: canPrintPortalUsers
  } = portalPermissions;

  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState('all');
  const [shiftScheduleFilter, setShiftScheduleFilter] = useState('all');
  const [shiftSchedules, setShiftSchedules] = useState({});
  const [availableShiftSchedules, setAvailableShiftSchedules] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  // Add state for new employee modal
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);

  // Portal registration modal state
  const [portalRegistration, setPortalRegistration] = useState({
    open: false,
    mode: 'create', // 'create' | 'edit'
    employee: null
  });
  const [portalForm, setPortalForm] = useState({
    username: '',
    pin: '1234',
    emailaddress: '',
    status: 1
  });
  const [savingPortal, setSavingPortal] = useState(false);
  const [portalMatch, setPortalMatch] = useState(null);
  const [portalMatchLoading, setPortalMatchLoading] = useState(false);
  const [portalMatchError, setPortalMatchError] = useState('');
  const [portalStatusUpdating, setPortalStatusUpdating] = useState({});

  // Fetch employees with pagination and shift schedules
  const fetchEmployees = async (page = 1, limit = 30, search = '', status = 'all', appointment = 'all', department = 'all', shiftSchedule = 'all') => {
    try {
      setLoadingEmployees(true);
      const response = await api.get('/employees/paginated-with-shifts', {
        params: {
          page,
          limit,
          search: search.trim(),
          status: undefined,
          appointment: appointment !== 'all' ? appointment : undefined,
          department: department !== 'all' ? department : undefined,
          shiftSchedule: shiftSchedule !== 'all' ? shiftSchedule : undefined
        }
      });
      
      const { employees: employeeData, total, totalPages: pages } = response.data;
      const rawEmployees = Array.isArray(employeeData) ? employeeData : [];
      const sanitizedEmployees = rawEmployees.map((row) => {
        const {
          PORTAL_REGISTERED,
          PORTAL_STATUS,
          PORTAL_USERPORTALID,
          PORTAL_USERNAME,
          PORTAL_EMAIL,
          PORTAL_PIN,
          PORTAL_CREATEDDATE,
          PORTAL_UPDATEDDATE,
          PORTAL_EMP_OBJID,
          ...rest
        } = row;
        const normalizedPortalPin =
          PORTAL_PIN !== undefined && PORTAL_PIN !== null && PORTAL_PIN !== ''
            ? String(PORTAL_PIN)
            : row.portalPin !== undefined && row.portalPin !== null && row.portalPin !== ''
              ? String(row.portalPin)
              : null;
        return {
          ...rest,
          portalUsername: row.portalUsername ?? row.PORTAL_USERNAME ?? null,
          portalStatus: PORTAL_STATUS !== undefined && PORTAL_STATUS !== null ? Number(PORTAL_STATUS) : null,
          portalEmail: PORTAL_EMAIL ?? null,
          portalPin: normalizedPortalPin,
          portalUserportalId: PORTAL_USERPORTALID ?? null,
          portalEmpObjId: PORTAL_EMP_OBJID ?? null
        };
      });
      setEmployees(sanitizedEmployees);
      setTotalEmployees(total || 0);
      setTotalPages(pages || 0);
      
      // Extract shift schedules from employee data
      const schedules = {};
      sanitizedEmployees.forEach(employee => {
        if (employee.SHIFTNAME || employee.SHIFTNO) {
          schedules[employee.USERID] = {
            SHIFTNAME: employee.SHIFTNAME,
            SHIFTNO: employee.SHIFTNO
          };
        }
      });
      setShiftSchedules(schedules);
    } catch (error) {
      console.error('Error fetching employees:', error);
      console.error('Error response:', error.response?.data);
      setEmployees([]);
      setTotalEmployees(0);
      setTotalPages(0);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Fetch available shift schedules
  const fetchShiftSchedules = async () => {
    try {
      const response = await api.get('/management/shiftschedules');
      setAvailableShiftSchedules(response.data || []);
    } catch (error) {
      console.error('Error fetching shift schedules:', error);
    }
  };

  // Fetch available departments
  const fetchDepartments = async () => {
    try {
      const response = await api.get('/employees/departments');
      setDepartments(response.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchPortalMatch = async (userId) => {
    try {
      setPortalMatchLoading(true);
      setPortalMatchError('');
      const response = await api.get(`/employees/${userId}/portal-profile`);
      setPortalMatch(response.data?.match || null);
    } catch (error) {
      console.error('Error fetching portal employee match:', error);
      setPortalMatch(null);
      setPortalMatchError('Unable to load employee profile.');
    } finally {
      setPortalMatchLoading(false);
    }
  };

  // Load initial employees
  useEffect(() => {
    fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
  }, []);

  // Fetch employees when page, rows per page, search, or status filter changes
  useEffect(() => {
    fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
  }, [currentPage, rowsPerPage, searchTerm, appointmentFilter, shiftScheduleFilter]);

  // Fetch departments and shift schedules on component mount
  useEffect(() => {
    fetchDepartments();
    fetchShiftSchedules();
  }, []);

  useEffect(() => {
    if (!employees || employees.length === 0) {
      console.log('[DTRPortalUsers Debug] Employees array empty after fetch.');
      return;
    }
  }, [employees]);

  // Handle search with debouncing
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle status filter change
  // Add new filter handlers
  const handleAppointmentFilterChange = (e) => {
    const value = e.target.value;
    setAppointmentFilter(value);
    setCurrentPage(1);
  };

  const handleShiftScheduleFilterChange = (e) => {
    const value = e.target.value;
    setShiftScheduleFilter(value);
    setCurrentPage(1);
  };

  const handleEditEmployee = (employeeId) => {
    setSelectedEmployeeId(employeeId);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setSelectedEmployeeId(null);
  };

  const handleEmployeeUpdated = (successInfo) => {
    if (successInfo && successInfo.success) {
      // Don't show success popup here - let DTRPortalFormModal handle it
    }
    // Close the modal
    setShowEditModal(false);
    setSelectedEmployeeId(null);
    // Refresh the employee list
    fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
  };

  const handlePrintEmployee = (employee) => {
    if (!canPrintPortalUsers) {
      alert('You do not have permission to print portal users.');
      return;
    }
    const shiftSchedule = shiftSchedules[employee.USERID];
    const appointmentName = getAppointmentName(employee.Appointment);
    
    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Portal User Record - ${employee.NAME}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            .photo-placeholder { width: 80px; height: 80px; background-color: #f0f0f0; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; color: #666; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Portal User Record</h2>
            <p><strong>Name:</strong> ${employee.NAME}</p>
            <p><strong>Badge Number:</strong> ${employee.BADGENUMBER}</p>
            <p><strong>DTR-ID:</strong> ${employee.USERID}</p>
            <p><strong>Department:</strong> ${employee.DEPTNAME || 'No Department'}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>DTR-ID</td>
                <td>${employee.USERID}</td>
              </tr>
              <tr>
                <td>Name</td>
                <td>${employee.NAME}</td>
              </tr>
              <tr>
                <td>Badge Number</td>
                <td>${employee.BADGENUMBER}</td>
              </tr>
              <tr>
                <td>Department</td>
                <td>${employee.DEPTNAME || 'No Department'}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const openPortalRegistrationModal = (employee, mode = 'create') => {
    if (mode === 'create' && !canCreatePortalUsers) {
      alert('You do not have permission to create portal users.');
      return;
    }

    if (mode === 'edit' && !canUpdatePortalUsers) {
      alert('You do not have permission to update portal users.');
      return;
    }

    const existingPin = employee?.portalPin;
    const normalizedPin = existingPin !== undefined && existingPin !== null && existingPin !== ''
      ? String(existingPin).replace(/\D/g, '').slice(0, 6)
      : '1234';

    setPortalRegistration({ open: true, mode, employee });
    setPortalForm({
      username: mode === 'edit' ? (employee.portalUsername || employee.BADGENUMBER || '') : (employee.BADGENUMBER || ''),
      pin: normalizedPin,
      emailaddress: employee.portalEmail || '',
      status: employee.portalStatus !== undefined && employee.portalStatus !== null ? Number(employee.portalStatus) : 1
    });
    setPortalMatch(null);
    setPortalMatchError('');
    if (employee && employee.USERID) {
      fetchPortalMatch(employee.USERID);
    }
  };

  const closePortalRegistrationModal = () => {
    setPortalRegistration({ open: false, mode: 'create', employee: null });
    setPortalForm({ username: '', pin: '1234', emailaddress: '', status: 1 });
    setPortalMatch(null);
    setPortalMatchError('');
    setSavingPortal(false);
  };

  const handlePortalFormChange = (field, value) => {
    if (field === 'pin') {
      const sanitized = (value || '').replace(/\D/g, '').slice(0, 6);
      setPortalForm(prev => ({ ...prev, pin: sanitized }));
      return;
    }

    if (field === 'status') {
      const normalizedStatus = Number(value) === 1 ? 1 : 0;
      setPortalForm(prev => ({ ...prev, status: normalizedStatus }));
      return;
    }

    setPortalForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitPortalRegistration = async () => {
    if (!portalRegistration.employee) return;
    const employee = portalRegistration.employee;

    if (portalRegistration.mode === 'edit' && !canUpdatePortalUsers) {
      alert('You do not have permission to update portal users.');
      return;
    }

    if (portalRegistration.mode === 'create' && !canCreatePortalUsers) {
      alert('You do not have permission to create portal users.');
      return;
    }

    const sanitizedPin = (portalForm.pin || '').replace(/\D/g, '').slice(0, 6);
    const finalPin = sanitizedPin || '1234';

    if (finalPin.length < 4 || finalPin.length > 6) {
      alert('PIN must be between 4 and 6 digits.');
      return;
    }

    const payload = {
      username: portalForm.username?.trim() || null,
      pin: finalPin,
      emailaddress: portalForm.emailaddress?.trim() || null,
      status: Number(portalForm.status) === 1 ? 1 : 0,
      dtrname: employee.NAME || null,
      emp_objid: portalMatch?.objid || null
    };

    try {
      setSavingPortal(true);
      if (portalRegistration.mode === 'edit') {
        await api.put(`/employees/${employee.USERID}/portal`, payload);
      } else {
        await api.post(`/employees/${employee.USERID}/portal-register`, payload);
      }
      alert('Portal account saved successfully.');
      closePortalRegistrationModal();
      fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
    } catch (error) {
      console.error('Error saving portal registration:', error);
      alert(error.response?.data?.message || 'Failed to save portal registration.');
    } finally {
      setSavingPortal(false);
    }
  };

  const handleDeletePortalUser = async (employee) => {
    if (!canDeletePortalUsers) {
      alert('You do not have permission to delete portal users.');
      return;
    }
    if (!employee.portalUsername) {
      alert('This user does not have a portal account yet.');
      return;
    }
    if (!window.confirm(`Remove portal access for ${employee.NAME}?`)) return;

    try {
      await api.delete(`/employees/${employee.USERID}/portal`);
      alert('Portal account removed successfully.');
      fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
    } catch (error) {
      console.error('Error deleting portal user:', error);
      alert(error.response?.data?.message || 'Failed to delete portal user.');
    }
  };

  // Add function to handle quick privilege toggle
  const handleQuickPrivilegeToggle = async (employee) => {
    if (!canUpdatePortalUsers) {
      alert('You do not have permission to update portal users.');
      return;
    }
    try {
      const currentPrivilege = parseInt(employee.privilege) || 0;
      const newPrivilege = currentPrivilege >= 0 ? -1 : 0;
      
      const updateData = {
        NAME: employee.NAME,
        BADGENUMBER: employee.BADGENUMBER,
        DEFAULTDEPTID: employee.DEFAULTDEPTID,
        SSN: employee.SSN,
        TITLE: employee.TITLE,
        GENDER: employee.GENDER,
        BIRTHDAY: employee.BIRTHDAY,
        HIREDDAY: employee.HIREDDAY,
        STREET: employee.STREET,
        privilege: newPrivilege
      };
      
      const response = await api.put(`/employees/${employee.USERID}`, updateData);

      if (response.data.message === 'Employee updated successfully') {
        fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
        alert(`Portal user status updated to ${newPrivilege >= 0 ? 'Active' : 'Inactive'}`);
      } else {
        alert('Error updating portal user status');
      }
    } catch (error) {
      console.error('Error updating portal user privilege:', error);
      alert('Error updating portal user status. Please try again.');
    }
  };

  // Get employee status based on privilege column from USERINFO table
  const getEmployeeStatus = (employee) => {
    const privilege = employee.privilege;
    
    if (privilege === null || privilege === undefined) {
      return 'Inactive';
    }
    
    const privilegeValue = typeof privilege === 'string' ? parseInt(privilege, 10) : privilege;
    
    if (privilegeValue >= 0) {
      return 'Active';
    } else {
      return 'Inactive';
    }
  };

  // Get employee photo
  const getEmployeePhoto = (employee) => {
    if (employee.PHOTO) {
      return (
        <img 
          src={employee.PHOTO} 
          alt={employee.NAME}
          className="w-10 h-10 rounded-full object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      );
    }
    
    return (
      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
        <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      </div>
    );
  };

  // Pagination controls
  const goToPage = (page) => {
    const maxPage = Math.max(totalPages, 1);
    setCurrentPage(Math.max(1, Math.min(page, maxPage)));
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  // Update the Add New Employee button click handler
  const handleAddNewEmployee = () => {
    if (!canCreatePortalUsers) {
      alert('You do not have permission to create portal users.');
      return;
    }
    setShowNewEmployeeModal(true);
  };

  const handleNewEmployeeSuccess = (successInfo) => {
    setShowNewEmployeeModal(false);
    
    if (successInfo && successInfo.success) {
      fetchEmployees(currentPage, rowsPerPage, searchTerm, 'all', appointmentFilter, 'all', shiftScheduleFilter);
    }
  };

  const filteredEmployees = useMemo(() => employees, [employees]);

  const handleRowsPerPageChange = (value) => {
    setRowsPerPage(value);
    setCurrentPage(1);
  };

  const handlePortalStatusToggle = async (employee) => {
    if (!canUpdatePortalUsers) {
      alert('You do not have permission to update portal users.');
      return;
    }
    if (!employee.portalUsername) {
      alert('This user does not have a portal account.');
      return;
    }

    const currentStatus = Number(employee.portalStatus) === 1 ? 1 : 0;
    const newStatus = currentStatus === 1 ? 0 : 1;

    const existingPin =
      employee.portalPin !== undefined && employee.portalPin !== null && employee.portalPin !== ''
        ? String(employee.portalPin).replace(/\D/g, '').slice(0, 6)
        : null;

    const payload = {
      username: employee.portalUsername,
      pin: existingPin && existingPin.length >= 4 ? existingPin : '1234',
      emailaddress: employee.portalEmail || null,
      status: newStatus,
      dtrname: employee.NAME || null,
      emp_objid: employee.portalEmpObjId || null
    };

    setPortalStatusUpdating(prev => ({ ...prev, [employee.USERID]: true }));

    try {
      await api.put(`/employees/${employee.USERID}/portal`, payload);
      setEmployees(prev =>
        prev.map(emp =>
          emp.USERID === employee.USERID ? { ...emp, portalStatus: newStatus } : emp
        )
      );
    } catch (error) {
      console.error('Error toggling portal status:', error);
      alert(error.response?.data?.message || 'Failed to update portal status.');
    } finally {
      setPortalStatusUpdating(prev => {
        const updated = { ...prev };
        delete updated[employee.USERID];
        return updated;
      });
    }
  };

  if (permissionsLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center text-gray-600">
        Loading portal user permissions...
      </div>
    );
  }

  if (!canReadPortalUsers) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-100 p-6 text-center text-red-600">
        You do not have permission to view portal users.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by DTR-ID, badge number, name, or department..."
              className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Add New Employee Button - Requires create permission */}
          {canCreatePortalUsers && (
            <div className="flex-1 sm:flex-none">
              <button
                onClick={handleAddNewEmployee}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition duration-200 ease-in-out flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add New Portal User</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loadingEmployees && (
          <div className="p-4 text-center">
            <div className="inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-gray-600">Loading portal users...</span>
            </div>
          </div>
        )}
        
        {/* Filters Section */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="space-y-4">
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {filteredEmployees.length} portal users
              </div>
              
              <span className="text-xs text-gray-400">Status & Department filters are not available in this view.</span>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  DTR Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  DTR ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Badge Number
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Has Login
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.length === 0 && !loadingEmployees ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    {searchTerm ? 'No portal users found matching your search.' : 'No portal users available.'}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const hasLogin = Boolean(employee.portalUsername);
                  return (
                    <tr key={employee.USERID} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {getEmployeePhoto(employee)}
                          <div className="font-semibold text-gray-900">{employee.NAME}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {employee.USERID}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {employee.BADGENUMBER || '—'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-medium ${
                            employee.portalUsername
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {employee.portalUsername || 'No Portal Access'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {employee.portalUsername ? (
                          canUpdatePortalUsers ? (
                            <div className="flex items-center justify-center">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={Number(employee.portalStatus) === 1}
                                  onChange={() => handlePortalStatusToggle(employee)}
                                  disabled={Boolean(portalStatusUpdating[employee.USERID]) || savingPortal}
                                />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-emerald-500 transition-colors peer-checked:bg-emerald-500"></div>
                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                <span className="ml-3 text-xs font-medium text-gray-700">
                                  {Number(employee.portalStatus) === 1 ? 'Active' : 'Inactive'}
                                </span>
                              </label>
                            </div>
                          ) : (
                            <div className="text-center text-gray-500 text-sm">
                              {Number(employee.portalStatus) === 1 ? 'Active' : 'Inactive'}
                            </div>
                          )
                        ) : (
                          <div className="text-center text-gray-400 text-sm">—</div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-center">
                        <div className="flex items-center justify-center gap-2">
                          {(() => {
                            const actionButtons = [];

                            if (canCreatePortalUsers && !hasLogin) {
                              actionButtons.push(
                                <button
                                  key="create"
                                  onClick={() => openPortalRegistrationModal(employee, 'create')}
                                  className="px-2 py-1 text-emerald-600 hover:text-emerald-800"
                                  title="Register Portal User"
                                  disabled={savingPortal}
                                >
                                  ➕
                                </button>
                              );
                            }

                            if (canUpdatePortalUsers && hasLogin) {
                              actionButtons.push(
                                <button
                                  key="edit"
                                  onClick={() => openPortalRegistrationModal(employee, 'edit')}
                                  className="px-2 py-1 text-blue-600 hover:text-blue-800"
                                  title="Edit Portal User"
                                  disabled={savingPortal}
                                >
                                  ✏️
                                </button>
                              );
                            }

                            if (canPrintPortalUsers) {
                              actionButtons.push(
                                <button
                                  key="print"
                                  onClick={() => handlePrintEmployee(employee)}
                                  className="px-2 py-1 text-green-600 hover:text-green-800"
                                  title="Print Portal User"
                                >
                                  🖨️
                                </button>
                              );
                            }

                            if (canDeletePortalUsers && hasLogin) {
                              actionButtons.push(
                                <button
                                  key="delete"
                                  onClick={() => handleDeletePortalUser(employee)}
                                  className="px-2 py-1 text-red-600 hover:text-red-800"
                                  title="Delete Portal User"
                                >
                                  🗑️
                                </button>
                              );
                            }

                            if (actionButtons.length === 0) {
                              return <span className="text-xs text-gray-400">No actions</span>;
                            }

                            return actionButtons;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length > 0 && (
          <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700">Rows per page</label>
                <select
                  value={rowsPerPage}
                  onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-500">
                  {Math.min((currentPage - 1) * rowsPerPage + 1, totalEmployees)}-
                  {Math.min(currentPage * rowsPerPage, totalEmployees)} of {totalEmployees}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="px-3 py-2 text-sm font-semibold text-gray-700">
                  Page {currentPage} of {Math.max(totalPages, 1)}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Employee Modal */}
      {canCreatePortalUsers && showNewEmployeeModal && (
        <DTRPortalFormModal
          isOpen={showNewEmployeeModal}
          onClose={() => setShowNewEmployeeModal(false)}
          onSuccess={handleNewEmployeeSuccess}
          title="Add New Portal User"
          initialFormData={{
            username: '',
            pin: '1234',
            emailaddress: '',
            status: 1
          }}
          departments={departments}
          shiftSchedules={availableShiftSchedules}
          isSaving={false}
        />
      )}

      {/* Edit Employee Modal */}
      {canUpdatePortalUsers && showEditModal && selectedEmployeeId && (
        <DTRPortalFormModal
          isOpen={showEditModal}
          onClose={handleCloseModal}
          onSuccess={handleEmployeeUpdated}
          title={`Edit Portal User: ${employees.find(e => e.USERID === selectedEmployeeId)?.NAME || ''}`}
          initialFormData={employees.find(e => e.USERID === selectedEmployeeId)}
          departments={departments}
          shiftSchedules={availableShiftSchedules}
          isSaving={false}
        />
      )}

      {/* Portal Registration Modal */}
      {portalRegistration.open &&
        portalRegistration.employee &&
        ((portalRegistration.mode === 'edit' && canUpdatePortalUsers) ||
          (portalRegistration.mode === 'create' && canCreatePortalUsers)) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {portalRegistration.mode === 'edit' ? 'Edit Portal Account' : 'Register Portal Account'}
              </h3>
              <button onClick={closePortalRegistrationModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1">Biometric User Details</h4>
                <p className="text-sm text-gray-500">{portalRegistration.employee.NAME} · DTR ID {portalRegistration.employee.USERID}</p>
                <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {portalMatchLoading ? (
                    <div className="text-sm text-gray-500">Looking up employee profile…</div>
                  ) : portalMatch ? (
                    <div className="flex items-center gap-3">
                      {portalMatch.photo ? (
                        <img
                          src={portalMatch.photo}
                          alt={portalMatch.fullName || 'Employee'}
                          className="w-12 h-12 rounded-full object-cover border"
                        />
                      ) : portalMatch.photo_path ? (
                        <img
                          src={portalMatch.photo_path}
                          alt={portalMatch.fullName || 'Employee'}
                          className="w-12 h-12 rounded-full object-cover border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white border flex items-center justify-center text-gray-400">
                          <span className="text-xl">👤</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{portalMatch.fullName || formatEmployeeName(portalMatch.surname, portalMatch.firstname, portalMatch.middlename)}</div>
                        <div className="text-xs text-gray-500">Employee OBJID: {portalMatch.objid}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No matching HR record found for this DTR user.</div>
                  )}
                  {portalMatchError && (
                    <div className="mt-2 text-xs text-red-600">{portalMatchError}</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Name</label>
                  <input
                    type="text"
                    value={portalForm.username}
                    onChange={(e) => handlePortalFormChange('username', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                    placeholder="Enter portal username"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
                  <input
                    type="text"
                    value={portalForm.pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      handlePortalFormChange('pin', value || '');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="4-6 digit PIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={portalForm.emailaddress}
                    onChange={(e) => handlePortalFormChange('emailaddress', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter email address"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Portal User Status</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold ${Number(portalForm.status) === 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                      {Number(portalForm.status) === 1 ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePortalFormChange('status', Number(portalForm.status) === 1 ? 0 : 1)}
                      className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${
                        Number(portalForm.status) === 1 ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          Number(portalForm.status) === 1 ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={closePortalRegistrationModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitPortalRegistration}
                disabled={savingPortal}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPortal ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DTRPortalUsers;