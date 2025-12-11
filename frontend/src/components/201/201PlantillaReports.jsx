import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../authContext';
import { formatEmployeeName } from '../../utils/employeenameFormatter';
import Print201PlantillaReports from './print_201PlantillaReports';

const Plantilla201Reports = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const { user } = useAuth();
  const componentId = '201-plantilla-reports';
  const printRef = useRef(null);
  
  const canRead = can(componentId, 'read');
  
  const [reportData, setReportData] = useState([]);
  const [allReportData, setAllReportData] = useState([]); // Store all data for filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [displayMode, setDisplayMode] = useState('default'); // 'default', 'department', 'sg'
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [sgFilter, setSgFilter] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [salaryGrades, setSalaryGrades] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  
  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      const deptList = response.data.data || response.data || [];
      setDepartments(deptList);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };
  
  // Fetch plantilla report data
  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/201-plantilla-reports');
      const data = response.data.data || [];
      setAllReportData(data);
      
      // Extract unique salary grades
      const uniqueSGs = [...new Set(data.map(row => row.salarygrade).filter(sg => sg !== null && sg !== undefined))].sort((a, b) => a - b);
      setSalaryGrades(uniqueSGs);
      
      setReportData(data);
    } catch (error) {
      console.error('Error fetching plantilla report:', error);
      setError(error.response?.data?.message || 'Failed to load plantilla report');
      setAllReportData([]);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch company info
  const fetchCompanyInfo = async () => {
    try {
      const response = await api.get('/env');
      if (response.data && response.data.success) {
        setCompanyInfo(response.data.data || {});
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  };

  useEffect(() => {
    if (canRead) {
      fetchReportData();
      fetchDepartments();
      fetchCompanyInfo();
    }
  }, [canRead]);
  
  // Handle print
  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plantilla of Personnel Report</title>
          <style>
            @media print {
              @page {
                size: 8.5in 13in landscape;
                margin: 0.3in;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                font-size: 7pt;
                line-height: 1.1;
              }
              .print-container {
                width: 100%;
                max-width: 12.9in;
                margin: 0 auto;
                padding: 0;
              }
              .header {
                text-align: center;
                margin-bottom: 0.15in;
                border-bottom: 2px solid #000;
                padding-bottom: 0.08in;
              }
              .header h1 {
                font-size: 14pt;
                font-weight: bold;
                margin: 0.03in 0;
                text-transform: uppercase;
                letter-spacing: 0.5pt;
              }
              .header h2 {
                font-size: 11pt;
                font-weight: bold;
                margin: 0.02in 0;
              }
              .header-info {
                font-size: 8pt;
                margin: 0.01in 0;
              }
              .print-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 6pt;
                margin-top: 0.08in;
                page-break-inside: auto;
              }
              .print-table th {
                background-color: #f0f0f0;
                border: 1px solid #000;
                padding: 2px 3px;
                text-align: left;
                font-weight: bold;
                font-size: 6pt;
                vertical-align: middle;
              }
              .print-table td {
                border: 1px solid #000;
                padding: 2px 3px;
                text-align: left;
                font-size: 6pt;
                vertical-align: top;
                word-wrap: break-word;
              }
              .print-table tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              .group-header {
                background-color: #e0e0e0;
                font-weight: bold;
                padding: 0.04in;
                margin-top: 0.08in;
                margin-bottom: 0.04in;
                border: 1px solid #000;
                font-size: 7pt;
                page-break-after: avoid;
              }
              .empty-value {
                color: #999;
              }
              .page-break {
                page-break-before: always;
              }
            }
            @media screen {
              body {
                font-family: Arial, sans-serif;
                font-size: 7pt;
                padding: 20px;
                background: #f5f5f5;
              }
              .print-container {
                width: 100%;
                max-width: 12.9in;
                margin: 0 auto;
                padding: 0.3in;
                background: white;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
              }
              .header {
                text-align: center;
                margin-bottom: 0.15in;
                border-bottom: 2px solid #000;
                padding-bottom: 0.08in;
              }
              .header h1 {
                font-size: 14pt;
                font-weight: bold;
                margin: 0.03in 0;
                text-transform: uppercase;
                letter-spacing: 0.5pt;
              }
              .header h2 {
                font-size: 11pt;
                font-weight: bold;
                margin: 0.02in 0;
              }
              .header-info {
                font-size: 8pt;
                margin: 0.01in 0;
              }
              .print-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 6pt;
                margin-top: 0.08in;
              }
              .print-table th {
                background-color: #f0f0f0;
                border: 1px solid #000;
                padding: 2px 3px;
                text-align: left;
                font-weight: bold;
                font-size: 6pt;
                vertical-align: middle;
              }
              .print-table td {
                border: 1px solid #000;
                padding: 2px 3px;
                text-align: left;
                font-size: 6pt;
                vertical-align: top;
                word-wrap: break-word;
              }
              .group-header {
                background-color: #e0e0e0;
                font-weight: bold;
                padding: 0.04in;
                margin-top: 0.08in;
                margin-bottom: 0.04in;
                border: 1px solid #000;
                font-size: 7pt;
              }
              .empty-value {
                color: #999;
              }
            }
          </style>
        </head>
        <body>
          ${printContents}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
  
  // Apply filters when filters or data change
  useEffect(() => {
    let filtered = [...allReportData];
    
    // Apply department filter
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(row => {
        const rowDeptId = row.department_id;
        return rowDeptId && String(rowDeptId) === String(departmentFilter);
      });
    }
    
    // Apply SG filter
    if (sgFilter !== 'all') {
      filtered = filtered.filter(row => {
        const rowSG = row.salarygrade;
        return rowSG && String(rowSG) === String(sgFilter);
      });
    }
    
    // Sort by Plantilla No ascending
    filtered.sort((a, b) => {
      const plantillaNoA = a.plantilla_no || '';
      const plantillaNoB = b.plantilla_no || '';
      
      // Extract numeric and non-numeric parts for proper sorting
      const numA = parseInt(plantillaNoA) || 0;
      const numB = parseInt(plantillaNoB) || 0;
      
      if (numA !== numB) {
        return numA - numB;
      }
      
      // If numeric parts are equal, sort alphabetically
      return plantillaNoA.localeCompare(plantillaNoB);
    });
    
    setReportData(filtered);
  }, [departmentFilter, sgFilter, allReportData]);
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value || value === null || value === undefined) return <span className="text-gray-400">-</span>;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return <span className="text-gray-400">-</span>;
    return `₱${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Format empty/null values
  const formatEmpty = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="text-gray-400">-</span>;
    }
    return value;
  };
  
  // Format status to show only first letter in capital
  const formatStatus = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="text-gray-400">-</span>;
    }
    const firstLetter = String(value).trim().charAt(0).toUpperCase();
    return firstLetter;
  };
  
  // Format actual salary - show "No Appropriation" if empty/null
  const formatActualSalary = (value) => {
    if (!value || value === null || value === undefined) {
      return <span className="text-xs text-gray-400">No Appropriation</span>;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return <span className="text-xs text-gray-400">No Appropriation</span>;
    }
    return `₱${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Format employee name - show "Vacant" if empty/null
  const formatEmployeeName = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="text-xs text-gray-400">Vacant</span>;
    }
    return value;
  };
  
  // Group data by display mode
  const getGroupedData = () => {
    if (displayMode === 'default') {
      return { 'All Records': reportData };
    } else if (displayMode === 'department') {
      const grouped = {};
      reportData.forEach(row => {
        const key = row.department_name || 'Unassigned';
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(row);
      });
      // Sort departments alphabetically
      const sorted = Object.keys(grouped).sort().reduce((acc, key) => {
        acc[key] = grouped[key];
        return acc;
      }, {});
      return sorted;
    } else if (displayMode === 'sg') {
      const grouped = {};
      reportData.forEach(row => {
        const key = row.salarygrade ? `SG ${String(row.salarygrade).padStart(2, '0')}` : 'Unassigned';
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(row);
      });
      // Sort by salary grade (numeric)
      const sorted = Object.keys(grouped).sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        const sgA = parseInt(a.replace('SG ', ''));
        const sgB = parseInt(b.replace('SG ', ''));
        return sgA - sgB;
      }).reduce((acc, key) => {
        acc[key] = grouped[key];
        return acc;
      }, {});
      return sorted;
    }
    return { 'All Records': reportData };
  };
  
  const groupedData = getGroupedData();
  
  // Calculate totals for authorized and actual salary
  const calculateTotals = (data) => {
    const totals = data.reduce((acc, row) => {
      const authorized = parseFloat(row.authorized_salary) || 0;
      const actual = parseFloat(row.actual_salary) || 0;
      acc.authorized += authorized;
      acc.actual += actual;
      return acc;
    }, { authorized: 0, actual: 0 });
    return totals;
  };
  
  const grandTotals = calculateTotals(reportData);
  
  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          Loading permissions...
        </div>
      </div>
    );
  }
  
  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have permission to view plantilla reports.
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Plantilla of Personnel</h1>
            <p className="text-sm text-gray-600 mt-1">Comprehensive report of all plantilla positions and assigned personnel</p>
            
            {/* Filters */}
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Department:</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                >
                  <option value="all">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.deptid} value={dept.deptid}>
                      {dept.departmentname || dept.departmentshortname || `Department ${dept.deptid}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by SG:</label>
                <select
                  value={sgFilter}
                  onChange={(e) => setSgFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[120px]"
                >
                  <option value="all">All SG</option>
                  {salaryGrades.map((sg) => (
                    <option key={sg} value={sg}>
                      SG {String(sg).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Display Mode:</label>
                <select
                  value={displayMode}
                  onChange={(e) => setDisplayMode(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="default">Default</option>
                  <option value="department">Group by Department</option>
                  <option value="sg">Group by SG</option>
                </select>
              </div>
              
              <button
                onClick={handlePrint}
                disabled={loading || reportData.length === 0}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading report data...</div>
        ) : reportData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No plantilla records found</div>
        ) : (
          <div className="overflow-x-auto">
            {Object.keys(groupedData).map((groupKey) => {
              const groupTotals = calculateTotals(groupedData[groupKey]);
              return (
                <div key={groupKey} className="mb-6">
                  {displayMode !== 'default' && (
                    <div className="bg-indigo-50 border-b-2 border-indigo-200 px-4 py-3 mb-2">
                      <h3 className="text-lg font-semibold text-indigo-900">
                        {groupKey}
                        <span className="ml-2 text-sm font-normal text-indigo-700">
                          ({groupedData[groupKey].length} {groupedData[groupKey].length === 1 ? 'record' : 'records'})
                        </span>
                      </h3>
                    </div>
                  )}
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plantilla No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '2%' }}>Level</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SG</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Authorize Salary</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Salary</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name of Incumbent</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '3%' }}>Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blood Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No of Yrs in Gov't</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CSC Eligibility</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Educational Attainment</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date of Last Promotion</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prof of Vocation</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedData[groupKey].map((row, index) => (
                        <tr key={row.plantilla_id || index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.plantilla_no)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <div>{formatEmpty(row.position)}</div>
                            {(row.position_shortname || row.department_shortname) && (
                              <div className="text-xs text-gray-500 mt-1">
                                {row.position_shortname 
                                  ? `${row.position_shortname}${row.department_shortname ? ` (${row.department_shortname})` : ''}`
                                  : row.department_shortname || ''
                                }
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.level)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.sg_step_increment)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.authorized_salary)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatActualSalary(row.actual_salary)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmployeeName(row.employee_name)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatStatus(row.status)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.blood_type)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.years_in_government)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatEmpty(row.csc_eligibility)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatEmpty(row.educational_attainment)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.date_last_promotion)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatEmpty(row.prof_of_vocation)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatEmpty(row.title)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {displayMode === 'default' ? 'GRAND TOTAL:' : 'TOTAL:'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                          {displayMode === 'default' 
                            ? formatCurrency(grandTotals.authorized)
                            : formatCurrency(groupTotals.authorized)
                          }
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                          {displayMode === 'default'
                            ? formatCurrency(grandTotals.actual)
                            : formatCurrency(groupTotals.actual)
                          }
                        </td>
                        <td colSpan="9" className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
       {!loading && reportData.length > 0 && (
         <div className="mt-4 text-sm text-gray-600">
           Total Records: {reportData.length}
         </div>
       )}
       
       {/* Print Template (Hidden) */}
       <div ref={printRef} style={{ display: 'none' }}>
         <Print201PlantillaReports
           reportData={reportData}
           filters={{ departmentFilter, sgFilter, departments }}
           displayMode={displayMode}
           companyInfo={companyInfo}
           user={user}
         />
       </div>
     </div>
   );
 };
 
 export default Plantilla201Reports;

