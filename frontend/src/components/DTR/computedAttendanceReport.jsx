import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';
import { formatEmployeeName } from '../../utils/employeenameFormatter';
import { useAuth } from '../../authContext';

const ComputedAttendanceReport = () => {
  const { user } = useAuth();
  
  // Filter states
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('full');
  
  // Reset period when month changes
  useEffect(() => {
    setSelectedPeriod('full');
  }, [selectedMonth]);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  
  // Data states
  const [computedDtrData, setComputedDtrData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Lookup states
  const [departments, setDepartments] = useState([]);
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [employeeStatusTypes, setEmployeeStatusTypes] = useState([]);
  
  // Company info state
  const [companyInfo, setCompanyInfo] = useState({
    lguDtrName: '',
    lguHrmo: '',
    logoPreview: null
  });
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  // Generate month options (last 2 years to current month) - descending order
  const monthOptions = useMemo(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const months = [];
    
    for (let year = currentYear - 2; year <= currentYear; year++) {
      const maxMonth = year === currentYear ? currentMonth : 12;
      for (let month = 1; month <= maxMonth; month++) {
        const date = new Date(year, month - 1, 1);
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const value = `${year}-${String(month).padStart(2, '0')}-01`;
        months.push({ value, label: `${monthName} ${year}` });
      }
    }
    // Sort in descending order (most recent first)
    return months.reverse();
  }, []);

  // Generate period options based on selected month
  const periodOptions = useMemo(() => {
    if (!selectedMonth) return [];

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
    const lastDay = new Date(year, month, 0).getDate();

    return [
      { value: 'full', label: `Full Month (${monthName} 1-${lastDay})` },
      { value: 'first', label: `1st Half (${monthName} 1-15)` },
      { value: 'second', label: `2nd Half (${monthName} 16-${lastDay})` }
    ];
  }, [selectedMonth]);

  // Set default selected month to current month
  useEffect(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const defaultMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    setSelectedMonth(defaultMonth);
  }, []);

  // Fetch lookup data and company info
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        // Fetch company info
        const companyResponse = await api.get('/company/info');
        if (companyResponse.data.success) {
          setCompanyInfo({
            lguDtrName: companyResponse.data.data.lguDtrName || '',
            lguHrmo: companyResponse.data.data.lguHrmo || '',
            logoPreview: companyResponse.data.data.logoPreview || null
          });
        }

        // Fetch departments
        const deptResponse = await api.get('/departments');
        if (deptResponse.data.success) {
          const deptData = deptResponse.data.data || [];
          // Sort departments by departmentshortname in ascending order
          const sortedDepts = [...deptData].sort((a, b) => {
            const nameA = (a.departmentshortname || '').toLowerCase();
            const nameB = (b.departmentshortname || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setDepartments(sortedDepts);
        }

        // Fetch appointment types
        const apptResponse = await api.get('/201-employees/lookup/appointmenttypes');
        if (apptResponse.data.success) {
          const apptData = apptResponse.data.data || [];
          // Sort appointment types by appointmentname in ascending order
          const sortedAppts = [...apptData].sort((a, b) => {
            const nameA = (a.appointmentname || '').toLowerCase();
            const nameB = (b.appointmentname || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setAppointmentTypes(sortedAppts);
        }

        // Fetch employee status types
        const statusResponse = await api.get('/201-employees/lookup/employeestatustypes');
        if (statusResponse.data.success) {
          const statusData = statusResponse.data.data || [];
          // Sort employee status types by empstatname/employeestatus in ascending order
          const sortedStatus = [...statusData].sort((a, b) => {
            const nameA = (a.empstatname || a.employeestatus || '').toLowerCase();
            const nameB = (b.empstatname || b.employeestatus || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
          console.log('✅ Employee status types fetched:', sortedStatus);
          setEmployeeStatusTypes(sortedStatus);
        } else {
          console.warn('⚠️ Employee status types response not successful:', statusResponse.data);
        }
      } catch (error) {
        console.error('❌ Error fetching lookup data:', error);
      }
    };

    fetchLookups();
  }, []);

  // Fetch computed DTR data
  const fetchComputedDtrData = async () => {
    if (!selectedMonth) {
      setComputedDtrData([]);
      return;
    }

    try {
      setLoading(true);
      
      // Extract month name and year from selectedMonth
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);
      
      // Map period values to match database format
      const periodMap = {
        'full': 'Full Month',
        'first': '1st Half',
        'second': '2nd Half'
      };
      const periodValue = periodMap[selectedPeriod] || selectedPeriod;
      
      // Build query parameters
      const params = {
        computedmonth: monthName,
        computedyear: computedYear,
        period: periodValue
      };
      
      if (selectedDepartment !== 'all') {
        params.department = selectedDepartment;
      }
      
      if (selectedAppointment !== 'all') {
        params.appointment = selectedAppointment;
      }
      
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }
      
      const response = await api.get('/computed-dtr', { params });
      
      if (response.data.success) {
        setComputedDtrData(response.data.data || []);
      } else {
        setComputedDtrData([]);
      }
    } catch (error) {
      console.error('❌ Error fetching computed DTR data:', error);
      setComputedDtrData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when filters change
  useEffect(() => {
    if (selectedMonth) {
      fetchComputedDtrData();
    } else {
      setComputedDtrData([]);
    }
  }, [selectedMonth, selectedPeriod, selectedDepartment, selectedAppointment, selectedStatus]);

  // Format minutes to HH:MM
  const formatMinutes = (minutes) => {
    const safeMinutes = Number.isFinite(minutes) ? Number(minutes) : 0;
    const hours = Math.floor(safeMinutes / 60);
    const mins = Math.round(safeMinutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Calculate totals
  const totals = useMemo(() => {
    const sum = computedDtrData.reduce((acc, record) => {
      acc.totalLates += Number(record.total_lates) || 0;
      acc.totalDays += Number(record.total_days) || 0;
      acc.totalNetDays += Number(record.total_netdays) || 0;
      acc.totalLeaves += Number(record.total_leaves) || 0;
      acc.totalTravels += Number(record.total_travels) || 0;
      acc.totalCdo += Number(record.total_cdo) || 0;
      return acc;
    }, {
      totalLates: 0,
      totalDays: 0,
      totalNetDays: 0,
      totalLeaves: 0,
      totalTravels: 0,
      totalCdo: 0
    });
    
    return {
      totalLates: isNaN(sum.totalLates) ? 0 : sum.totalLates,
      totalDays: isNaN(sum.totalDays) ? 0 : sum.totalDays,
      totalNetDays: isNaN(sum.totalNetDays) ? 0 : Math.round(sum.totalNetDays * 10000) / 10000,
      totalLeaves: isNaN(sum.totalLeaves) ? 0 : sum.totalLeaves,
      totalTravels: isNaN(sum.totalTravels) ? 0 : sum.totalTravels,
      totalCdo: isNaN(sum.totalCdo) ? 0 : sum.totalCdo
    };
  }, [computedDtrData]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return computedDtrData.slice(startIndex, endIndex);
  }, [computedDtrData, currentPage, itemsPerPage]);

  // Calculate total pages
  useEffect(() => {
    const total = Math.ceil(computedDtrData.length / itemsPerPage);
    setTotalPages(total);
    if (currentPage > total && total > 0) {
      setCurrentPage(1);
    }
  }, [computedDtrData.length, itemsPerPage, currentPage]);

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [computedDtrData]);

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Handle items per page change
  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  // Handle Print
  const handlePrint = () => {
    if (!computedDtrData || computedDtrData.length === 0) {
      alert('No data to print');
      return;
    }

    // Get month and period labels
    const monthLabel = selectedMonth ? monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth : '';
    const periodLabel = periodOptions.find(p => p.value === selectedPeriod)?.label || selectedPeriod;
    
    // Get department and appointment labels
    const deptLabel = selectedDepartment === 'all' ? 'All Departments' : departments.find(d => d.departmentshortname === selectedDepartment)?.departmentshortname || selectedDepartment;
    const apptLabel = selectedAppointment === 'all' ? 'All Appointments' : appointmentTypes.find(a => a.id == selectedAppointment)?.appointmentname || selectedAppointment;
    
    // Format date for system message
    const printDate = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const systemName = companyInfo.lguDtrName || 'HRIS System';
    const printedBy = user?.USERID || user?.id || user?.username || 'System';

    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Computed Attendance Report</title>
          <style>
            @media print {
              @page { margin: 0.5in; }
            }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0;
              padding: 20px;
            }
            .header {
              position: relative;
              margin-bottom: 20px;
              text-align: center;
              min-height: 80px;
            }
            .logo {
              position: absolute;
              left: 0;
              top: 0;
              max-width: 70px;
              max-height: 70px;
              z-index: 0;
              opacity: 0.4;
            }
            .header-text {
              position: relative;
              z-index: 1;
            }
            .hrmo-text {
              font-size: 22px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 5px;
              color: #000;
            }
            .header-title {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin-bottom: 5px;
            }
            .month-period {
              text-align: center;
              margin-bottom: 10px;
              font-size: 14px;
            }
            .filters {
              margin-bottom: 15px;
              font-size: 12px;
              text-align: center;
            }
            .filters p {
              margin: 0;
              display: inline;
            }
            .filters p:first-child::after {
              content: " | ";
              margin: 0 10px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 10px;
            }
            th { 
              border: 1px solid #000; 
              padding: 8px 6px; 
              text-align: center;
              background-color: #f3f4f6; 
              font-weight: bold;
              font-size: 11px;
            }
            td { 
              border: 1px solid #000; 
              padding: 4px 6px; 
              text-align: left; 
              font-size: 10px;
            }
            tfoot { 
              background-color: #e0e7ff; 
              font-weight: bold; 
            }
            .footer {
              margin-top: 20px;
              font-size: 11px;
              text-align: center;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${companyInfo.logoPreview ? `<img src="${companyInfo.logoPreview}" alt="Logo" class="logo" />` : ''}
            <div class="header-text">
              <div class="hrmo-text">Human Resource Management Office</div>
              <div class="header-title">Computed Attendance Report</div>
              <div class="month-period">For the Month of <strong>${monthLabel}</strong>, <strong>${periodLabel}</strong></div>
              <div class="filters">
                <p><strong>Department:</strong> ${deptLabel}</p>
                <p><strong>Appointment:</strong> ${apptLabel}</p>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">NO.</th>
                <th>Employee</th>
                <th style="width: 60px;">LEAVES</th>
                <th style="width: 60px;">LOCATORS</th>
                <th style="width: 60px;">TRAVELS</th>
                <th style="width: 50px;">CDO</th>
                <th style="width: 60px;">LATES</th>
                <th style="width: 60px;">DAYS</th>
                <th style="width: 70px;">NETDAYS</th>
              </tr>
            </thead>
            <tbody>
              ${computedDtrData.map((record, index) => {
                const employeeName = formatEmployeeName(
                  record.surname,
                  record.firstname,
                  record.middlename,
                  record.extension
                ) || '—';
                const deptPosition = [record.department_name, record.position_title].filter(Boolean).join(' - ') || '—';
                return `
                  <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>${employeeName}<br><small style="font-size: 9px; color: #666;">${deptPosition}</small></td>
                    <td style="text-align: center;">${record.total_leaves || 0}</td>
                    <td style="text-align: center;">0</td>
                    <td style="text-align: center;">${record.total_travels || 0}</td>
                    <td style="text-align: center;">${record.total_cdo || 0}</td>
                    <td style="text-align: center;">${formatMinutes(record.total_lates || 0)}</td>
                    <td style="text-align: center;">${Number(record.total_days || 0).toFixed(3)}</td>
                    <td style="text-align: center;">${Number(record.total_netdays || 0).toFixed(4)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="text-align: center;"><strong>Totals</strong></td>
                <td style="text-align: center;">${totals.totalLeaves}</td>
                <td style="text-align: center;">0</td>
                <td style="text-align: center;">${totals.totalTravels}</td>
                <td style="text-align: center;">${totals.totalCdo}</td>
                <td style="text-align: center;">${Math.round(Number(totals.totalLates || 0))}</td>
                <td style="text-align: center;">${Number(totals.totalDays).toFixed(3)}</td>
                <td style="text-align: center;">${Number(totals.totalNetDays).toFixed(4)}</td>
              </tr>
            </tfoot>
          </table>
          
          <div class="footer">
            System-Generated Document — ${systemName} - Printed on: ${printDate}, Printed by: ${printedBy}
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Handle Export CSV
  const handleExportCSV = () => {
    if (!computedDtrData || computedDtrData.length === 0) {
      alert('No data to export');
      return;
    }

    // Prepare CSV headers
    const headers = ['NO.', 'Employee', 'Department/Position', 'LEAVES', 'LOCATORS', 'TRAVELS', 'CDO', 'LATES', 'DAYS', 'NETDAYS'];
    
    // Prepare CSV rows
    const rows = computedDtrData.map((record, index) => {
      const employeeName = formatEmployeeName(
        record.surname,
        record.firstname,
        record.middlename,
        record.extension
      ) || '—';
      const deptPosition = [record.department_name, record.position_title].filter(Boolean).join(' - ') || '—';
      
      return [
        index + 1,
        employeeName,
        deptPosition,
        record.total_leaves || 0,
        0,
        record.total_travels || 0,
        record.total_cdo || 0,
        formatMinutes(record.total_lates || 0),
        Number(record.total_days || 0).toFixed(3),
        Number(record.total_netdays || 0).toFixed(4)
      ];
    });

    // Add totals row
    const totalsRow = [
      'Totals',
      '',
      '',
      totals.totalLeaves,
      0,
      totals.totalTravels,
      totals.totalCdo,
      formatMinutes(totals.totalLates),
      Number(totals.totalDays).toFixed(3),
      Number(totals.totalNetDays).toFixed(4)
    ];

    // Combine all rows
    const csvRows = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      totalsRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename with date
    const dateStr = new Date().toISOString().split('T')[0];
    const monthLabel = selectedMonth ? monthOptions.find(m => m.value === selectedMonth)?.label.replace(/\s+/g, '_') || 'All' : 'All';
    a.download = `Computed_Attendances_${monthLabel}_${dateStr}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Handle Export Excel
  const handleExportExcel = () => {
    if (!computedDtrData || computedDtrData.length === 0) {
      alert('No data to export');
      return;
    }

    import('xlsx').then(XLSX => {
      // Prepare data for Excel
      const excelData = computedDtrData.map((record, index) => {
        const employeeName = formatEmployeeName(
          record.surname,
          record.firstname,
          record.middlename,
          record.extension
        ) || '—';
        const deptPosition = [record.department_name, record.position_title].filter(Boolean).join(' - ') || '—';
        
        return {
          'NO.': index + 1,
          'Employee': employeeName,
          'Department/Position': deptPosition,
          'LEAVES': record.total_leaves || 0,
          'LOCATORS': 0,
          'TRAVELS': record.total_travels || 0,
          'CDO': record.total_cdo || 0,
          'LATES': formatMinutes(record.total_lates || 0),
          'DAYS': Number(record.total_days || 0).toFixed(3),
          'NETDAYS': Number(record.total_netdays || 0).toFixed(4)
        };
      });

      // Add totals row
      excelData.push({
        'NO.': 'Totals',
        'Employee': '',
        'Department/Position': '',
        'LEAVES': totals.totalLeaves,
        'LOCATORS': 0,
        'TRAVELS': totals.totalTravels,
        'CDO': totals.totalCdo,
        'LATES': formatMinutes(totals.totalLates),
        'DAYS': Number(totals.totalDays).toFixed(3),
        'NETDAYS': Number(totals.totalNetDays).toFixed(4)
      });

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Computed Attendances');
      
      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const monthLabel = selectedMonth ? monthOptions.find(m => m.value === selectedMonth)?.label.replace(/\s+/g, '_') || 'All' : 'All';
      XLSX.writeFile(workbook, `Computed_Attendances_${monthLabel}_${dateStr}.xlsx`);
    }).catch(error => {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting to Excel. Please make sure the xlsx package is installed.');
    });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Computed Attendances Report</h2>
        
        {/* Filter Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Month Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Month</option>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Period Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                disabled={!selectedMonth}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.deptid} value={dept.departmentshortname}>
                    {dept.departmentshortname}
                  </option>
                ))}
              </select>
            </div>

            {/* Appointment Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Appointment
              </label>
              <select
                value={selectedAppointment}
                onChange={(e) => setSelectedAppointment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Appointments</option>
                {appointmentTypes.map((appt) => (
                  <option key={appt.id} value={appt.id}>
                    {appt.appointmentname}
                  </option>
                ))}
              </select>
            </div>

            {/* Employee Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                {employeeStatusTypes.map((status) => (
                  <option key={status.empstatid || status.id} value={status.empstatid || status.id}>
                    {status.empstatname || status.employeestatus || status.statusname}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons - Print and Export */}
        {!loading && computedDtrData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-end gap-3">
              {/* Print Button */}
              <button
                onClick={handlePrint}
                className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Print Report"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>

              {/* Export Dropdown */}
              <div className="relative group">
                <button
                  className="inline-flex items-center px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium shadow hover:bg-green-700 transition-colors"
                  title="Export Report"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="py-1">
                    <button
                      onClick={handleExportCSV}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export CSV
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Excel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading computed attendance data...</span>
          </div>
        )}

        {/* Data Grid */}
        {!loading && computedDtrData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* Pagination Controls - Top */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">Show:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-500">records</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, computedDtrData.length)} of {computedDtrData.length} entries
                  </div>
                </div>
                
                {/* Pagination Navigation */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {/* Page Numbers */}
                  <div className="flex items-center space-x-1">
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
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-1 text-sm border rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      NO.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      LEAVES
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      LOCATORS
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      TRAVELS
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CDO
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      LATES
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      DAYS
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      NETDAYS
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((record, index) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    const employeeName = formatEmployeeName(
                      record.surname,
                      record.firstname,
                      record.middlename,
                      record.extension
                    ) || '—';
                    const deptPosition = [record.department_name, record.position_title].filter(Boolean).join(' - ') || '—';
                    
                    return (
                      <tr key={record.computeid ?? index} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {rowNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-semibold text-gray-900">{employeeName}</div>
                          <div className="text-xs text-gray-500">{deptPosition}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                            {record.total_leaves || 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            0
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            {record.total_travels || 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            {record.total_cdo || 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {Math.round(Number(record.total_lates || 0))}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {Number(record.total_days || 0).toFixed(3)}
                        </td>
                        <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-900 w-20">
                          {Number(record.total_netdays || 0).toFixed(4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Totals
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      Total Records: {computedDtrData.length}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalLeaves}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">0</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalTravels}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalCdo}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      {Math.round(Number(totals.totalLates || 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{Number(totals.totalDays).toFixed(3)}</td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-700 w-20">{Number(totals.totalNetDays).toFixed(4)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Controls - Bottom */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-center space-x-2">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                <div className="flex items-center space-x-1">
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
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 text-sm border rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && computedDtrData.length === 0 && selectedMonth && (
          <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
            <p>No computed attendance records found for the selected filters.</p>
          </div>
        )}

        {/* No Month Selected */}
        {!loading && !selectedMonth && (
          <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
            <p>Please select a month to view computed attendance records.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComputedAttendanceReport;

