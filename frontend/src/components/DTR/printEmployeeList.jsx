import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import { getAppointmentShortName } from '../../utils/appointmentLookup';
import logoImage from '../../files/dallogo.png';

const PrintEmployeeList = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [shiftSchedules, setShiftSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [filters, setFilters] = useState({
    privilege: 'all',
    appointment: 'all',
    department: 'all',
    shiftSchedule: 'all'
  });

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // Add pagination parameters
      params.append('page', currentPage);
      params.append('limit', pageSize);
      
      if (filters.privilege !== 'all') {
        params.append('status', filters.privilege);
      }
      if (filters.appointment !== 'all') {
        params.append('appointment', filters.appointment);
      }
      if (filters.department !== 'all') {
        params.append('department', filters.department);
      }
      if (filters.shiftSchedule !== 'all') {
        params.append('shiftSchedule', filters.shiftSchedule);
      }

      const response = await api.get(`/employees/paginated-with-shifts?${params.toString()}`);
      setEmployees(response.data.employees || []);
      setTotalEmployees(response.data.total || 0);
      setTotalPages(Math.ceil((response.data.total || 0) / pageSize));
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllEmployeesForPrint = async () => {
    try {
      const params = new URLSearchParams();
      
      // For printing, get all employees without pagination
      params.append('limit', '1000');
      
      if (filters.privilege !== 'all') {
        params.append('status', filters.privilege);
      }
      if (filters.appointment !== 'all') {
        params.append('appointment', filters.appointment);
      }
      if (filters.department !== 'all') {
        params.append('department', filters.department);
      }
      if (filters.shiftSchedule !== 'all') {
        params.append('shiftSchedule', filters.shiftSchedule);
      }

      const response = await api.get(`/employees/paginated-with-shifts?${params.toString()}`);
      return response.data.employees || [];
    } catch (error) {
      console.error('Error fetching all employees for print:', error);
      return [];
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments([]);
    }
  };

  const fetchShiftSchedules = async () => {
    try {
      const response = await api.get('/management/shiftschedules');
      setShiftSchedules(response.data || []);
    } catch (error) {
      console.error('Error fetching shift schedules:', error);
      setShiftSchedules([]);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [filters, currentPage, pageSize]);

  useEffect(() => {
    fetchDepartments();
    fetchShiftSchedules();
  }, []);

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      privilege: 'all',
      appointment: 'all',
      department: 'all',
      shiftSchedule: 'all'
    });
    setCurrentPage(1); // Reset to first page when clearing filters
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  const handlePrint = async () => {
    setPrinting(true);
    
    // Get all employees for printing (not just current page)
    const allEmployees = await fetchAllEmployeesForPrint();
    
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const printStyles = `
      @media print {
        .no-print { display: none !important; }
        
        /* Hide DTR Management sidebar and navigation */
        .fixed.inset-y-0.left-0.z-50,
        .fixed.inset-0.bg-gray-600,
        nav,
        header,
        .bg-white.shadow-sm.border-b,
        .flex.items-center.justify-between.px-6.py-4,
        .flex.items-center.space-x-4,
        .bg-white.rounded-xl.shadow-sm.border.border-gray-200.p-6:first-child,
        .flex.items-center.justify-between:first-child {
          display: none !important;
        }
        
        /* Reset main content margins for print */
        .flex-1.transition-all.duration-300 {
          margin-left: 0 !important;
        }
        
        /* Print-specific styles */
        body { 
          font-size: 12px; 
          margin: 0;
          padding: 0;
        }
        .print-header {
          display: block !important;
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
        }
        .print-logo {
          height: 60px;
          margin-bottom: 10px;
        }
        .print-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .print-subtitle {
          font-size: 14px;
          color: #666;
        }
        .print-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .print-table th, 
        .print-table td { 
          border: 1px solid #333; 
          padding: 6px; 
          text-align: left; 
          font-size: 11px;
        }
        .print-table th { 
          background-color: #f0f0f0; 
          font-weight: bold; 
        }
        .print-footer {
          display: block !important;
          text-align: center;
          margin-top: 20px;
          font-size: 10px;
          color: #666;
          border-top: 1px solid #ccc;
          padding-top: 10px;
        }
        @page {
          margin: 0.5in;
        }
      }
    `;
    
    const styleElement = document.createElement('style');
    styleElement.textContent = printStyles;
    document.head.appendChild(styleElement);
    
    // Temporarily replace the employees state with all employees for printing
    const originalEmployees = employees;
    setEmployees(allEmployees);
    
    // Wait for state update, then print
    setTimeout(() => {
      window.print();
      
      // Restore original employees state and cleanup
      setTimeout(() => {
        setEmployees(originalEmployees);
        document.head.removeChild(styleElement);
        setPrinting(false);
      }, 1000);
    }, 100);
  };

  const getPrivilegeText = (privilege) => {
    if (privilege >= 0) return 'Active';
    return 'Inactive';
  };

  const getPrivilegeColor = (privilege) => {
    if (privilege >= 0) return 'text-green-600 bg-green-100';
    return 'text-red-600 bg-red-100';
  };

  // Generate page numbers for pagination
  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Print Header - Hidden by default, shown only when printing */}
      <div className="print-header no-print" style={{ display: 'none' }}>
        <img src={logoImage} alt="Logo" className="print-logo" />
        <div className="print-title">Human Resource Management Office</div>
        <div className="print-subtitle">List as of {new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Employee List Report</h2>
            <p className="text-gray-600 mt-1">Generate and print employee list with filters</p>
          </div>
          <button
            onClick={handlePrint}
            disabled={printing || totalEmployees === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>{printing ? 'Printing...' : 'Print List'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 no-print">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
          >
            Clear Filters
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.privilege}
              onChange={(e) => handleFilterChange('privilege', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Employees</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Appointment</label>
            <select
              value={filters.appointment}
              onChange={(e) => handleFilterChange('appointment', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Appointments</option>
              <option value="1">Regular</option>
              <option value="2">Casual</option>
              <option value="3">Co-Terminus</option>
              <option value="4">Provisional</option>
              <option value="5">JO</option>
              <option value="6">PB</option>
              <option value="7">SE</option>
              <option value="8">Others</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <select
              value={filters.department}
              onChange={(e) => handleFilterChange('department', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept.DEPTID} value={dept.DEPTID}>
                  {dept.DEPTNAME}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shift Schedule</label>
            <select
              value={filters.shiftSchedule}
              onChange={(e) => handleFilterChange('shiftSchedule', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Schedules</option>
              {shiftSchedules.map(schedule => (
                <option key={schedule.SHIFTNO} value={schedule.SHIFTNO}>
                  {schedule.SHIFTNAME}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 no-print">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Employee List ({totalEmployees} employees)
          </h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Show:</label>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-700">per page</span>
            </div>
            {loading && (
              <div className="flex items-center space-x-2 text-blue-600">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm">Loading...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 print-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Badge No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shift
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Appointment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((employee) => (
                <tr key={employee.USERID} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {employee.USERID}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {employee.BADGENUMBER}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.NAME}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.TITLE || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.DEPTNAME || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.SHIFTNAME || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getAppointmentShortName(employee.Appointment)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPrivilegeColor(employee.privilege)}`}>
                      {getPrivilegeText(employee.privilege)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 no-print">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, totalEmployees)}
                  </span>{' '}
                  of <span className="font-medium">{totalEmployees}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {generatePageNumbers().map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === currentPage
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
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

      {/* Print Footer - Hidden by default, shown only when printing */}
      <div className="print-footer no-print" style={{ display: 'none' }}>
        System Generated ({new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}) By: {user?.USERID || 'Unknown'}
      </div>
    </div>
  );
};

export default PrintEmployeeList;
