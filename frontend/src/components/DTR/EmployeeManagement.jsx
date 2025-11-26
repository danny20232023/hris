import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import DTRPortalFormModal from './DTRPortalFormModal';
import { useAuth } from '../../authContext';
import { getAppointmentName, getAppointmentShortName, getAppointmentOptions } from '../../utils/appointmentLookup';

function EmployeeManagement({ onRefresh }) {
  const { user } = useAuth();
  
  // More robust privilege check
  const hasAddEmployeePrivilege = () => {
    const privilege = user?.PRIVILEGE || user?.privilege || user?.Privilege;
    const privilegeValue = parseInt(privilege);
    return privilegeValue === 3;
  };

  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // Add status filter state
  const [appointmentFilter, setAppointmentFilter] = useState('all'); // Add appointment filter
  const [departmentFilter, setDepartmentFilter] = useState('all'); // Add department filter
  const [shiftScheduleFilter, setShiftScheduleFilter] = useState('all'); // Add shift schedule filter
  const [shiftSchedules, setShiftSchedules] = useState({});
  const [availableShiftSchedules, setAvailableShiftSchedules] = useState([]); // Add this
  const [departments, setDepartments] = useState([]); // Add departments state
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const navigate = useNavigate();

  // Add state for new employee modal
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);

  // Fetch employees with pagination and shift schedules
  const fetchEmployees = async (page = 1, limit = 30, search = '', status = 'all', appointment = 'all', department = 'all', shiftSchedule = 'all') => {
    try {
      setLoadingEmployees(true);
      const response = await api.get('/employees/paginated-with-shifts', {
        params: {
          page,
          limit,
          search: search.trim(),
          status: status !== 'all' ? status : undefined, // Only include status if not 'all'
          appointment: appointment !== 'all' ? appointment : undefined,
          department: department !== 'all' ? department : undefined,
          shiftSchedule: shiftSchedule !== 'all' ? shiftSchedule : undefined
        }
      });
      
      const { employees: employeeData, total, totalPages: pages } = response.data;
      setEmployees(employeeData || []);
      setTotalEmployees(total || 0);
      setTotalPages(pages || 0);
      
      // Extract shift schedules from employee data - Updated to use SHIFTNAME and SHIFTNO directly
      const schedules = {};
      if (employeeData && Array.isArray(employeeData)) {
        employeeData.forEach(employee => {
          if (employee.SHIFTNAME || employee.SHIFTNO) {
            schedules[employee.USERID] = {
              SHIFTNAME: employee.SHIFTNAME,
              SHIFTNO: employee.SHIFTNO
            };
          }
        });
      }
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

  // Load initial employees
  useEffect(() => {
    fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
  }, []);

  // Fetch employees when page, rows per page, search, or status filter changes
  useEffect(() => {
    fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
  }, [currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter]);

  // Fetch departments and shift schedules on component mount
  useEffect(() => {
    fetchDepartments();
    fetchShiftSchedules();
  }, []);

  // Handle search with debouncing
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle status filter change
  const handleStatusFilterChange = (e) => {
    const value = e.target.value;
    setStatusFilter(value);
    setCurrentPage(1);
  };

  // Add new filter handlers
  const handleAppointmentFilterChange = (e) => {
    const value = e.target.value;
    setAppointmentFilter(value);
    setCurrentPage(1);
  };

  const handleDepartmentFilterChange = (e) => {
    const value = e.target.value;
    setDepartmentFilter(value);
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
      // setSuccessData(successInfo);
      // setShowSuccessPopup(true);
    }
    // Close the modal
    setShowEditModal(false);
    setSelectedEmployeeId(null);
    // Refresh the employee list
    fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
  };

  const handlePrintEmployee = (employee) => {
    const shiftSchedule = shiftSchedules[employee.USERID];
    const appointmentName = getAppointmentName(employee.Appointment);
    
    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee Record - ${employee.NAME}</title>
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
            <h2>Employee Record</h2>
            <p><strong>Name:</strong> ${employee.NAME}</p>
            <p><strong>Badge Number:</strong> ${employee.BADGENUMBER}</p>
            <p><strong>Position:</strong> ${employee.TITLE || 'N/A'}</p>
            <p><strong>Department:</strong> ${employee.DEPTNAME || 'No Department'}</p>
            <p><strong>Appointment:</strong> ${appointmentName}</p>
            <p><strong>Shift Schedule:</strong> ${shiftSchedule ? shiftSchedule.SHIFTNAME || 'Assigned' : 'Not Assigned'}</p>
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
                <td>Employee ID</td>
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
                <td>Position</td>
                <td>${employee.TITLE || 'N/A'}</td>
              </tr>
              <tr>
                <td>Department</td>
                <td>${employee.DEPTNAME || 'No Department'}</td>
              </tr>
              <tr>
                <td>Department ID</td>
                <td>${employee.DEFAULTDEPTID || 'N/A'}</td>
              </tr>
              <tr>
                <td>Appointment</td>
                <td>${appointmentName}</td>
              </tr>
              <tr>
                <td>Shift Schedule</td>
                <td>${shiftSchedule ? shiftSchedule.SHIFTNAME || 'Assigned' : 'Not Assigned'}</td>
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

  // Add function to handle quick privilege toggle
  const handleQuickPrivilegeToggle = async (employee) => {
    try {
      const currentPrivilege = parseInt(employee.privilege) || 0;
      const newPrivilege = currentPrivilege >= 0 ? -1 : 0; // Toggle between active (0) and inactive (-1)
      
      // Send all required fields to avoid 500 error
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
        // Refresh the employee list to show updated status
        fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
        alert(`Employee status updated to ${newPrivilege >= 0 ? 'Active' : 'Inactive'}`);
      } else {
        alert('Error updating employee status');
      }
    } catch (error) {
      console.error('Error updating employee privilege:', error);
      alert('Error updating employee status. Please try again.');
    }
  };

  // Add function to handle quick shift schedule update
  const handleQuickShiftUpdate = async (employee, newShiftNo) => {
    try {
      const currentShift = getShiftSchedule(employee);
      const newShift = availableShiftSchedules.find(s => s.SHIFTNO === newShiftNo);
      
      if (!newShift) {
        alert('Selected shift schedule not found');
        return;
      }

      const confirmMessage = `Are you sure you want to change ${employee.NAME}'s shift schedule from "${currentShift}" to "${newShift.SHIFTNAME}"?`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }

      const response = await api.put(`/employees/${employee.USERID}`, {
        NAME: employee.NAME,
        BADGENUMBER: employee.BADGENUMBER,
        SSN: employee.SSN,
        DEFAULTDEPTID: employee.DEFAULTDEPTID,
        TITLE: employee.TITLE,
        GENDER: employee.GENDER,
        BIRTHDAY: employee.BIRTHDAY,
        HIREDDAY: employee.HIREDDAY,
        STREET: employee.STREET,
        privilege: employee.privilege,
        InheritDeptSchClass: newShiftNo // Update shift schedule
      });

      if (response.data.message === 'Employee updated successfully') {
        alert(`Successfully updated ${employee.NAME}'s shift schedule to ${newShift.SHIFTNAME}`);
        // Refresh the employee list to show updated shift schedule
        fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
      } else {
        alert('Failed to update shift schedule. Please try again.');
      }
    } catch (error) {
      console.error('Error updating shift schedule:', error);
      alert('Error updating shift schedule. Please try again.');
    }
  };

  // Get employee status based on privilege column from USERINFO table
  const getEmployeeStatus = (employee) => {
    // Check if privilege value exists and is a number
    const privilege = employee.privilege;
    
    if (privilege === null || privilege === undefined) {
      return 'Inactive'; // Default to inactive if privilege is not set
    }
    
    // Convert to number if it's a string
    const privilegeValue = typeof privilege === 'string' ? parseInt(privilege, 10) : privilege;
    
    // If privilege is 0 or greater than 0, employee is active
    // If privilege is below 0 or -1, employee is inactive
    if (privilegeValue >= 0) {
      return 'Active';
    } else {
      return 'Inactive';
    }
  };

  // Get shift schedule display - Updated to handle direct SHIFTNAME
  const getShiftSchedule = (employee) => {
    // First check if we have it in shiftSchedules
    const shiftSchedule = shiftSchedules[employee.USERID];
    if (shiftSchedule && shiftSchedule.SHIFTNAME) {
      return shiftSchedule.SHIFTNAME;
    }
    
    // Fallback to direct employee data
    if (employee.SHIFTNAME) {
      return employee.SHIFTNAME;
    }
    
    return 'Not Assigned';
  };

  // Get appointment display name
  const getAppointmentDisplay = (employee) => {
    if (employee.Appointment !== null && employee.Appointment !== undefined) {
      return getAppointmentShortName(employee.Appointment);
    }
    return 'Not Set';
  };

  // Get appointment color scheme for badges
  const getAppointmentColorScheme = (appointmentId) => {
    switch (appointmentId) {
      case 1: // Full-time
        return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', hover: 'hover:bg-green-200' };
      case 2: // Part-time
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', hover: 'hover:bg-yellow-200' };
      case 3: // Temporary
        return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', hover: 'hover:bg-blue-200' };
      case 4: // Intern
        return { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', hover: 'hover:bg-purple-200' };
      case 5: // Contractor
        return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', hover: 'hover:bg-orange-200' };
      case 6: // Volunteer
        return { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300', hover: 'hover:bg-pink-200' };
      case 7: // Seasonal
        return { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300', hover: 'hover:bg-teal-200' };
      case 8: // On-call
        return { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300', hover: 'hover:bg-indigo-200' };
      case 9: // On-site
        return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', hover: 'hover:bg-red-200' };
      case 10: // Remote
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', hover: 'hover:bg-gray-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', hover: 'hover:bg-gray-200' };
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

  // Update the SHIFT SCHEDULE column to show only dropdown
  const renderShiftScheduleColumn = (employee) => {
    const currentShift = getShiftSchedule(employee);
    const currentShiftNo = employee.SHIFTNO || employee.InheritDeptSchClass || 0;

    return (
      <select
        value={currentShiftNo}
        onChange={(e) => handleQuickShiftUpdate(employee, parseInt(e.target.value))}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
        title={`Current: ${currentShift} - Click to change`}
      >
        <option value={0}>No Schedule</option>
        {availableShiftSchedules.map((shift) => (
          <option key={shift.SHIFTNO} value={shift.SHIFTNO}>
            {shift.SHIFTNAME}
          </option>
        ))}
      </select>
    );
  };

  // Pagination controls
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  // Update the Add New Employee button click handler
  const handleAddNewEmployee = () => {
    setShowNewEmployeeModal(true);
  };

  const handleNewEmployeeSuccess = (successInfo) => {
    // Close the modal regardless of success or cancel
    setShowNewEmployeeModal(false);
    
    // Only refresh the employee list if it was a successful save
    if (successInfo && successInfo.success) {
      fetchEmployees(currentPage, rowsPerPage, searchTerm, statusFilter, appointmentFilter, departmentFilter, shiftScheduleFilter);
    }
  };

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
              placeholder="Search by ID, badge number, name, position, or department..."
              className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Add New Employee Button - Only show if user privilege is 3 */}
          {hasAddEmployeePrivilege() && (
            <div className="flex-1 sm:flex-none">
              <button
                onClick={handleAddNewEmployee}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition duration-200 ease-in-out flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add New Employee</span>
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
              <span className="text-gray-600">Loading employees...</span>
            </div>
          </div>
        )}
        
        {/* Filters Section - Updated layout to prevent overlapping */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="space-y-4">
            {/* Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* Status Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-700">Status</label>
                <select
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {/* Appointment Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-700">Appointment</label>
                <select
                  value={appointmentFilter}
                  onChange={handleAppointmentFilterChange}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Types</option>
                  {getAppointmentOptions().map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-700">Department</label>
                <select
                  value={departmentFilter}
                  onChange={handleDepartmentFilterChange}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept.DEPTID} value={dept.DEPTID}>
                      {dept.DEPTNAME}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Schedule Filter */}
              <div className="flex flex-col space-y-1">
                <label className="text-xs font-medium text-gray-700">Shift Schedule</label>
                <select
                  value={shiftScheduleFilter}
                  onChange={handleShiftScheduleFilterChange}
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Shifts</option>
                  <option value="0">No Schedule</option>
                  {availableShiftSchedules.map((shift) => (
                    <option key={shift.SHIFTNO} value={shift.SHIFTNO}>
                      {shift.SHIFTNAME}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Employee Count Display */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {totalEmployees} employees
              </div>
              
              {/* Clear All Filters Button */}
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setAppointmentFilter('all');
                  setDepartmentFilter('all');
                  setShiftScheduleFilter('all');
                  setCurrentPage(1);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PHOTO
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BADGE NO
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NAME
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  POSITION
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  DEPARTMENT
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SHIFT SCHEDULE
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  APPOINTMENT
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  STATUS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ACTION BUTTONS
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.length === 0 && !loadingEmployees ? (
                <tr>
                  <td colSpan="10" className="px-6 py-4 text-center text-gray-500">
                    {searchTerm ? 'No employees found matching your search.' : 'No employees available.'}
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.USERID} className="hover:bg-gray-50">
                    {/* PHOTO Column */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getEmployeePhoto(employee)}
                      </div>
                    </td>
                    
                    {/* ID Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {employee.USERID}
                    </td>
                    
                    {/* BADGE NO Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.BADGENUMBER || 'N/A'}
                    </td>
                    
                    {/* NAME Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className="font-medium">{employee.NAME}</span>
                        {/* Only show SSN if logged-in user has privilege level 3 */}
                        {user && (user.privilege === 3 || user.PRIVILEGE === 3) && employee.SSN && (
                          <span className="text-xs text-gray-500">SSN: {employee.SSN}</span>
                        )}
                      </div>
                    </td>
                    
                    {/* POSITION Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.TITLE || 'N/A'}
                    </td>
                    
                    {/* DEPARTMENT Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.DEPTNAME || 'No Department'}
                    </td>
                    
                    {/* SHIFT SCHEDULE Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {renderShiftScheduleColumn(employee)}
                    </td>

                    {/* APPOINTMENT Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const appointmentId = employee.Appointment;
                        const colorScheme = getAppointmentColorScheme(appointmentId);
                        const displayText = getAppointmentDisplay(employee);
                        const fullName = getAppointmentName(appointmentId);
                        
                        return (
                          <div className="flex justify-center">
                            <span 
                              className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 ${colorScheme.bg} ${colorScheme.text} ${colorScheme.border} ${colorScheme.hover} shadow-sm`}
                              title={`${fullName} - Click for details`}
                            >
                              <span className="flex items-center justify-center space-x-1.5">
                                <div className={`w-2 h-2 rounded-full ${colorScheme.dot}`}></div>
                                <span className="font-medium">{displayText}</span>
                              </span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    
                    {/* STATUS Column */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <label className={`flex items-center cursor-pointer px-3 py-2 rounded-lg transition-all duration-200 ${
                          getEmployeeStatus(employee) === 'Active' 
                            ? 'bg-green-100 hover:bg-green-200' 
                            : 'bg-red-100 hover:bg-red-200'
                        }`}>
                          <input
                            type="checkbox"
                            checked={getEmployeeStatus(employee) === 'Active'}
                            onChange={() => handleQuickPrivilegeToggle(employee)}
                            className={`w-4 h-4 rounded focus:ring-2 focus:ring-offset-2 ${
                              getEmployeeStatus(employee) === 'Active'
                                ? 'text-green-600 bg-green-100 border-green-300 focus:ring-green-500'
                                : 'text-red-600 bg-red-100 border-red-300 focus:ring-red-500'
                            }`}
                          />
                          <span className={`ml-2 text-sm font-medium ${
                            getEmployeeStatus(employee) === 'Active' 
                              ? 'text-green-800' 
                              : 'text-red-800'
                          }`}>
                            {getEmployeeStatus(employee) === 'Active' ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                      </div>
                    </td>
                    
                    {/* ACTION BUTTONS Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleEditEmployee(employee.USERID)}
                          className="text-indigo-600 hover:text-indigo-900 px-3 py-1 rounded border border-indigo-300 hover:bg-indigo-50 transition duration-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handlePrintEmployee(employee)}
                          className="text-green-600 hover:text-green-900 px-3 py-1 rounded border border-green-300 hover:bg-green-50 transition duration-200"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalEmployees > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-700">Show:</label>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-700">entries</span>
                </div>
                
                {/* Removed status filter from here */}
                
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * rowsPerPage, totalEmployees)}</span> of{' '}
                  <span className="font-medium">{totalEmployees}</span> results
                </div>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {/* Page Numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalEmployees}</div>
            <div className="text-sm text-gray-600">Total Employees</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {employees.filter(emp => getEmployeeStatus(emp) === 'Active').length}
            </div>
            <div className="text-sm text-gray-600">Active (Current Page)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {employees.filter(emp => getEmployeeStatus(emp) === 'Inactive').length}
            </div>
            <div className="text-sm text-gray-600">Inactive (Current Page)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {employees.filter(emp => shiftSchedules[emp.USERID]).length}
            </div>
            <div className="text-sm text-gray-600">With Shift Schedule (Current Page)</div>
          </div>
        </div>
      </div>

      {/* Floating Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Edit Employee</h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="overflow-y-auto max-h-[calc(95vh-120px)] p-6">
              <DTRPortalFormModal 
                employeeId={selectedEmployeeId} 
                onSuccess={handleEmployeeUpdated}
                isModal={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* New Employee Modal */}
      {showNewEmployeeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Add New Employee</h3>
              <button
                onClick={() => setShowNewEmployeeModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="overflow-y-auto max-h-[calc(95vh-120px)] p-6">
              <DTRPortalFormModal 
                onSuccess={handleNewEmployeeSuccess}
                isModal={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeManagement;
