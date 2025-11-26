import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import logoImage from '../../files/dallogo.png';

const PrintLocatorEntries = () => {
  const { user } = useAuth();
  const [locatorEntries, setLocatorEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Get current date for default values
  const getCurrentDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  };

  const getCurrentMonth = () => {
    const today = new Date();
    return (today.getMonth() + 1).toString(); // Month is 0-indexed, so add 1
  };

  const [filters, setFilters] = useState({
    employee: 'all',
    department: 'all',
    dateFilterType: 'month', // Changed from 'range' to 'month'
    dateFrom: getCurrentDate(),
    dateTo: getCurrentDate(),
    month: getCurrentMonth(), // Set to current month by default
    year: new Date().getFullYear() // Set to current year by default
  });

  const fetchLocatorEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('pageSize', pageSize);
      
      if (filters.employee !== 'all') {
        params.append('employeeSearch', filters.employee);
      }
      if (filters.department !== 'all') {
        // Note: Department filtering might need to be implemented in backend
      }
      if (filters.destination && filters.destination !== 'all') {
        params.append('destinationSearch', filters.destination);
      }
      
      // Handle date filtering based on type
      if (filters.dateFilterType === 'range') {
        if (filters.dateFrom) {
          params.append('dateFrom', filters.dateFrom);
        }
        if (filters.dateTo) {
          params.append('dateTo', filters.dateTo);
        }
      } else if (filters.dateFilterType === 'month') {
        // Convert month/year to date range
        const startDate = new Date(filters.year, filters.month - 1, 1);
        const endDate = new Date(filters.year, filters.month, 0);
        params.append('dateFrom', startDate.toISOString().split('T')[0]);
        params.append('dateTo', endDate.toISOString().split('T')[0]);
      }

      console.log('Current filters:', filters);
      console.log('API params being sent:', params.toString());
      const response = await api.get(`/locator?${params.toString()}`);
      console.log('Locator response:', response.data);
      
      setLocatorEntries(response.data.data || []);
      setTotalEntries(response.data.pagination?.totalRecords || 0);
      setTotalPages(response.data.pagination?.totalPages || 0);
    } catch (error) {
      console.error('Error fetching locator entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLocatorEntriesForPrint = async () => {
    try {
      const params = new URLSearchParams();
      
      // For printing, get all entries without pagination
      params.append('page', 1);
      params.append('pageSize', 10000);
      
      console.log('Print function filters:', filters);
      
      if (filters.employee !== 'all') {
        params.append('employeeSearch', filters.employee);
      }
      if (filters.department !== 'all') {
        // Note: Department filtering might need to be implemented in backend
      }
      if (filters.destination && filters.destination !== 'all') {
        params.append('destinationSearch', filters.destination);
      }
      
      // Handle date filtering based on type - EXACTLY the same as regular fetch
      if (filters.dateFilterType === 'range') {
        if (filters.dateFrom) {
          params.append('dateFrom', filters.dateFrom);
        }
        if (filters.dateTo) {
          params.append('dateTo', filters.dateTo);
        }
      } else if (filters.dateFilterType === 'month') {
        // Convert month/year to date range
        const startDate = new Date(filters.year, filters.month - 1, 1);
        const endDate = new Date(filters.year, filters.month, 0);
        
        console.log('Print date calculation:', {
          year: filters.year,
          month: filters.month,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        });
        
        params.append('dateFrom', startDate.toISOString().split('T')[0]);
        params.append('dateTo', endDate.toISOString().split('T')[0]);
      }

      console.log('Print API params being sent:', params.toString());
      const response = await api.get(`/locator?${params.toString()}`);
      console.log('All locator entries for print:', response.data);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching all locator entries for print:', error);
      return [];
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
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

  useEffect(() => {
    fetchLocatorEntries();
  }, [filters, currentPage, pageSize]);

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
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
      employee: 'all',
      department: 'all',
      dateFilterType: 'month', // Changed from 'range' to 'month'
      dateFrom: getCurrentDate(),
      dateTo: getCurrentDate(),
      month: getCurrentMonth(),
      year: new Date().getFullYear()
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
    
    try {
      // Get all locator entries for printing (not just current page)
      const allEntries = await fetchAllLocatorEntriesForPrint();
      
      console.log('Print data:', allEntries);
      console.log('Print data length:', allEntries.length);
      
      if (!allEntries || allEntries.length === 0) {
        alert('No data to print');
        setPrinting(false);
        return;
      }
      
      // Create a temporary print window
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Locator Entries Report</title>
            <style>
              body { 
                font-family: Arial, sans-serif;
                font-size: 12px; 
                margin: 0;
                padding: 20px;
              }
              .print-header {
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
            </style>
          </head>
          <body>
            <div class="print-header">
              <div class="print-title">Human Resource Management Office</div>
              <div class="print-subtitle">Locator Entries as of ${new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</div>
            </div>
            
            <table class="print-table">
              <thead>
                <tr>
                  <th>Locator Date</th>
                  <th>Locator No</th>
                  <th>Employee</th>
                  <th>Destination</th>
                  <th>Time Departed</th>
                  <th>Time Arrived</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                ${allEntries.map(entry => `
                  <tr>
                    <td>${formatDateTime(entry.LOCDATE || entry.LOCATORDATE)}</td>
                    <td>${entry.LOCNO || entry.LOCATORID || 'N/A'}</td>
                    <td>${entry.NAME || getEmployeeName(entry.LOCUSERID || entry.USERID)}</td>
                    <td>${entry.LOCDESTINATION || entry.LOCATION || 'N/A'}</td>
                    <td>${formatDateTime(entry.LOCTIMEDEPARTURE) || 'N/A'}</td>
                    <td>${formatDateTime(entry.LOCTIMEARRIVAL) || 'N/A'}</td>
                    <td>${entry.LOCPURPOSE || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="print-footer">
              System Generated (${new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}) By: ${user?.USERID || 'Unknown'}
            </div>
          </body>
        </html>
      `;
      
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
        setPrinting(false);
      };
      
    } catch (error) {
      console.error('Error during print:', error);
      setPrinting(false);
    }
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return 'N/A';
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEmployeeName = (userId) => {
    const employee = employees.find(emp => emp.USERID === userId);
    return employee ? employee.NAME : `User ID: ${userId}`;
  };

  const getDepartmentName = (deptId) => {
    const department = departments.find(dept => dept.DEPTID === deptId);
    return department ? department.DEPTNAME : 'N/A';
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

  // Generate month options (only show months up to current month for current year)
  const monthOptions = useMemo(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const selectedYear = filters.year;
    
    const months = [
      { value: '1', label: 'January' },
      { value: '2', label: 'February' },
      { value: '3', label: 'March' },
      { value: '4', label: 'April' },
      { value: '5', label: 'May' },
      { value: '6', label: 'June' },
      { value: '7', label: 'July' },
      { value: '8', label: 'August' },
      { value: '9', label: 'September' },
      { value: '10', label: 'October' },
      { value: '11', label: 'November' },
      { value: '12', label: 'December' }
    ];
    
    // If selected year is current year, only show months up to current month
    if (selectedYear === currentYear) {
      return months.slice(0, currentMonth);
    }
    
    // For previous years, show all months
    return months;
  }, [filters.year]);

  // Generate year options (last 2 years to current year)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    
    // Generate years from 2 years ago to current year
    for (let year = currentYear - 2; year <= currentYear; year++) {
      years.push(year);
    }
    
    return years;
  }, []);

  return (
    <div className="space-y-6">
      {/* Print Header - Hidden by default, shown only when printing */}
      <div className="print-header" style={{ display: 'none' }}>
        <img src={logoImage} alt="Logo" className="print-logo" />
        <div className="print-title">Human Resource Management Office</div>
        <div className="print-subtitle">Locator Entries as of {new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Locator Entries Report</h2>
            <p className="text-gray-600 mt-1">Generate and print locator entries with filters</p>
          </div>
          <button
            onClick={handlePrint}
            disabled={printing || totalEntries === 0}
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
        
        {/* Employee and Department Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
            <select
              value={filters.employee}
              onChange={(e) => handleFilterChange('employee', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Employees</option>
              {employees.map(employee => (
                <option key={employee.USERID} value={employee.USERID}>
                  {employee.NAME}
                </option>
              ))}
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
        </div>

        {/* Date Filters */}
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Filter Type</label>
              <select
                value={filters.dateFilterType}
                onChange={(e) => handleFilterChange('dateFilterType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="range">Date Range</option>
                <option value="month">By Month</option>
              </select>
            </div>

            {/* Conditional date filter inputs */}
            {filters.dateFilterType === 'range' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div></div> {/* Empty div for grid alignment */}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                  <select
                    value={filters.month}
                    onChange={(e) => handleFilterChange('month', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Months</option>
                    {monthOptions.map(month => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                  <select
                    value={filters.year}
                    onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {yearOptions.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div></div> {/* Empty div for grid alignment */}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 no-print">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Locator Entries ({totalEntries} entries)
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
                  Locator Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Locator No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destination
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Departed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Arrived
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {locatorEntries.map((entry, index) => (
                <tr key={entry.LOCATORUID || entry.LOCATORID || index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(entry.LOCDATE || entry.LOCATORDATE)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {entry.LOCNO || entry.LOCATORID || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.NAME || getEmployeeName(entry.LOCUSERID || entry.USERID)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.LOCDESTINATION || entry.LOCATION || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(entry.LOCTIMEDEPARTURE) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(entry.LOCTIMEARRIVAL) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.LOCPURPOSE || 'N/A'}
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
                    {Math.min(currentPage * pageSize, totalEntries)}
                  </span>{' '}
                  of <span className="font-medium">{totalEntries}</span> results
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
      <div className="print-footer" style={{ display: 'none' }}>
        System Generated ({new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}) By: {user?.USERID || 'Unknown'}
      </div>
    </div>
  );
};

export default PrintLocatorEntries;
