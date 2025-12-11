import React from 'react';

const Print201PlantillaReports = ({ reportData, filters, displayMode, companyInfo, user }) => {
  const formatCurrency = (value) => {
    if (!value || value === null || value === undefined) return <span className="empty-value">-</span>;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return <span className="empty-value">-</span>;
    return `₱${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatEmpty = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="empty-value">-</span>;
    }
    return value;
  };

  // Format status to show only first letter in capital
  const formatStatus = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="empty-value">-</span>;
    }
    const firstLetter = String(value).trim().charAt(0).toUpperCase();
    return firstLetter;
  };
  
  // Format actual salary - show "No Appropriation" if empty/null
  const formatActualSalary = (value) => {
    if (!value || value === null || value === undefined) {
      return <span className="empty-value" style={{ fontSize: '5pt' }}>No Appropriation</span>;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return <span className="empty-value" style={{ fontSize: '5pt' }}>No Appropriation</span>;
    }
    return `₱${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Format employee name - show "Vacant" if empty/null
  const formatEmployeeNameForPrint = (value) => {
    if (!value || value === null || value === undefined || String(value).trim() === '' || value === 'N/A') {
      return <span className="empty-value" style={{ fontSize: '5pt' }}>Vacant</span>;
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
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

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

  // Get filter labels
  const getFilterLabels = () => {
    const labels = [];
    if (filters.departmentFilter !== 'all') {
      const dept = filters.departments.find(d => String(d.deptid) === String(filters.departmentFilter));
      if (dept) {
        labels.push(`Department: ${dept.departmentname || dept.departmentshortname}`);
      }
    }
    if (filters.sgFilter !== 'all') {
      labels.push(`SG: ${String(filters.sgFilter).padStart(2, '0')}`);
    }
    return labels.length > 0 ? labels.join(' | ') : 'All Records';
  };

  return (
    <div className="print-container">
      <style>{`
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
      `}</style>

      <div className="header">
        <h1>PLANTILLA OF PERSONNEL</h1>
        {companyInfo && companyInfo.companyname && (
          <h2>{companyInfo.companyname.toUpperCase()}</h2>
        )}
        <div className="header-info">
          {getFilterLabels()}
          {displayMode !== 'default' && ` | Display: ${displayMode === 'department' ? 'Group by Department' : 'Group by SG'}`}
        </div>
        <div className="header-info">
          Generated on: {currentDate}
          {user && user.username && ` | Generated by: ${user.username}`}
        </div>
      </div>

      {Object.keys(groupedData).map((groupKey, groupIndex) => {
        const groupTotals = calculateTotals(groupedData[groupKey]);
        return (
          <div key={groupKey}>
            {displayMode !== 'default' && (
              <div className="group-header">
                {groupKey} ({groupedData[groupKey].length} {groupedData[groupKey].length === 1 ? 'record' : 'records'})
              </div>
            )}
            <table className="print-table">
              <thead>
                <tr>
                <th style={{ width: '4%' }}>Plantilla No</th>
                <th style={{ width: '10%' }}>Position</th>
                <th style={{ width: '2%' }}>Level</th>
                <th style={{ width: '5%' }}>SG</th>
                <th style={{ width: '6%' }}>Authorize Salary</th>
                  <th style={{ width: '6%' }}>Actual Salary</th>
                  <th style={{ width: '10%' }}>Name of Incumbent</th>
                  <th style={{ width: '3%' }}>Status</th>
                  <th style={{ width: '4%' }}>Blood Type</th>
                  <th style={{ width: '5%' }}>Yrs in Gov't</th>
                  <th style={{ width: '8%' }}>CSC Eligibility</th>
                  <th style={{ width: '8%' }}>Educational Attainment</th>
                  <th style={{ width: '6%' }}>Last Promotion</th>
                  <th style={{ width: '8%' }}>Prof of Vocation</th>
                  <th style={{ width: '6%' }}>Title</th>
                </tr>
              </thead>
              <tbody>
                {groupedData[groupKey].map((row, index) => (
                  <tr key={row.plantilla_id || index}>
                    <td>{formatEmpty(row.plantilla_no)}</td>
                    <td>
                      <div>{formatEmpty(row.position)}</div>
                      {(row.position_shortname || row.department_shortname) && (
                        <div style={{ fontSize: '5pt', color: '#666', marginTop: '2px' }}>
                          {row.position_shortname 
                            ? `${row.position_shortname}${row.department_shortname ? ` (${row.department_shortname})` : ''}`
                            : row.department_shortname || ''
                          }
                        </div>
                      )}
                    </td>
                    <td>{formatEmpty(row.level)}</td>
                    <td>{formatEmpty(row.sg_step_increment)}</td>
                    <td>{formatCurrency(row.authorized_salary)}</td>
                    <td>{formatActualSalary(row.actual_salary)}</td>
                    <td>{formatEmployeeNameForPrint(row.employee_name)}</td>
                    <td>{formatStatus(row.status)}</td>
                    <td>{formatEmpty(row.blood_type)}</td>
                    <td>{formatEmpty(row.years_in_government)}</td>
                    <td>{formatEmpty(row.csc_eligibility)}</td>
                    <td>{formatEmpty(row.educational_attainment)}</td>
                    <td>{formatEmpty(row.date_last_promotion)}</td>
                    <td>{formatEmpty(row.prof_of_vocation)}</td>
                    <td>{formatEmpty(row.title)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f0f0f0', borderTop: '2px solid #000' }}>
                  <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px' }}>
                    {displayMode === 'default' ? 'GRAND TOTAL:' : 'TOTAL:'}
                  </td>
                  <td style={{ fontWeight: 'bold', padding: '3px' }}>
                    {displayMode === 'default'
                      ? formatCurrency(grandTotals.authorized)
                      : formatCurrency(groupTotals.authorized)
                    }
                  </td>
                  <td style={{ fontWeight: 'bold', padding: '3px' }}>
                    {displayMode === 'default'
                      ? formatCurrency(grandTotals.actual)
                      : formatCurrency(groupTotals.actual)
                    }
                  </td>
                  <td colSpan="9"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      <div style={{ marginTop: '0.1in', fontSize: '7pt', textAlign: 'center' }}>
        Total Records: {reportData.length}
      </div>
    </div>
  );
};

export default Print201PlantillaReports;
