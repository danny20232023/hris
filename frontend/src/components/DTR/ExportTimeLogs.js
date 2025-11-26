// frontend/src/components/ExportTimeLogs.js

// Helper to format employee info as CSV header rows
function employeeInfoToCsvRows(employeeInfo) {
  if (!employeeInfo) return [];
  return [
    [`Name:`, employeeInfo.NAME || ''],
    [`Badge Number:`, employeeInfo.BADGENUMBER || ''],
    [`SSN:`, employeeInfo.SSN || 'N/A'],
    [`Department:`, employeeInfo.DEPTNAME || 'No Department'],
    [`Assigned Shift:`, employeeInfo.SHIFTNAME || ''],
    [
      `Shift Times:`,
      `AM In: ${employeeInfo.SHIFT_AMCHECKIN || ''} | AM Out: ${employeeInfo.SHIFT_AMCHECKOUT || ''} | PM In: ${employeeInfo.SHIFT_PMCHECKIN || ''} | PM Out: ${employeeInfo.SHIFT_PMCHECKOUT || ''}`
    ],
    [] // blank row
  ];
}

// Helper to format totals row
function totalsRow(logs, columns) {
  const totalLate = logs.reduce((sum, log) => sum + (Number(log.LATE) || 0), 0);
  const totalHours = logs.reduce((sum, log) => sum + (Number(log.TOTAL_HOURS) || 0), 0);
  const row = Array(columns.length).fill('');
  // Find the columns for LATE and TOTAL HOURS
  const lateIdx = columns.findIndex(col => col.field === 'LATE');
  const hoursIdx = columns.findIndex(col => col.field === 'TOTAL_HOURS');
  if (lateIdx !== -1) row[lateIdx] = totalLate;
  if (hoursIdx !== -1) row[hoursIdx] = totalHours;
  // Label
  row[0] = 'TOTALS:';
  return row;
}

// CSV Export
export function exportGridToCSV(logs, columns, employeeInfo) {
  if (!logs || logs.length === 0) return;

  // If columns are not provided, use all keys from the first log
  if (!columns) {
    const allKeys = Object.keys(logs[0]);
    columns = allKeys.map(key => ({ header: key, field: key }));
  }

  // Employee info header rows
  const infoRows = employeeInfoToCsvRows(employeeInfo).map(row => row.map(cell => `"${cell}"`).join(','));

  // Header row
  const headerRow = columns.map(col => `"${col.header}"`).join(',');

  // Data rows
  const dataRows = logs.map(row =>
    columns.map(col => {
      let value = row[col.field];
      if (typeof value === 'undefined' || value === null) value = '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );

  // Totals row
  const totals = totalsRow(logs, columns).map(cell => `"${cell}"`).join(',');

  const csvRows = [
    ...infoRows,
    headerRow,
    ...dataRows,
    totals
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'time_logs.csv';
  a.click();
  window.URL.revokeObjectURL(url);
}

// Excel Export (requires xlsx package)
export function exportGridToExcel(logs, columns, employeeInfo) {
  if (!logs || logs.length === 0) return;
  import('xlsx').then(XLSX => {
    if (!columns) {
      const allKeys = Object.keys(logs[0]);
      columns = allKeys.map(key => ({ header: key, field: key }));
    }

    // Employee info header rows
    const infoRows = employeeInfoToCsvRows(employeeInfo);

    // Data rows
    const dataRows = logs.map(row =>
      Object.fromEntries(columns.map(col => [col.header, row[col.field] ?? '']))
    );

    // Totals row as an object
    const totals = totalsRow(logs, columns);
    const totalsObj = {};
    columns.forEach((col, idx) => {
      totalsObj[col.header] = totals[idx];
    });

    // Combine all for worksheet
    const worksheetData = [
      ...infoRows.map(row => {
        // Convert array to object for xlsx
        const obj = {};
        row.forEach((cell, idx) => {
          obj[`_col${idx}`] = cell;
        });
        return obj;
      }),
      ...dataRows,
      totalsObj
    ];

    const worksheet = XLSX.utils.json_to_sheet(worksheetData, { skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Logs');
    XLSX.writeFile(workbook, 'time_logs.xlsx');
  });
}
