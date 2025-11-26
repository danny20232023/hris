import React, { useEffect, useRef } from 'react';

// Helper to get the majority month from logs
function getMajorityMonth(logs) {
  if (!logs || logs.length === 0) return '';
  const monthCounts = {};
  logs.forEach(log => {
    const dateStr = log.DATE || log.date;
    if (!dateStr) return;
    const month = new Date(dateStr).toLocaleString('default', { month: 'long', year: 'numeric' });
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  });
  let max = 0, majorityMonth = '';
  Object.entries(monthCounts).forEach(([month, count]) => {
    if (count > max) {
      max = count;
      majorityMonth = month;
    }
  });
  return majorityMonth;
}

const columns = [
  { header: 'DATE', field: 'DATE' },
  { header: 'AM-CHECKIN', field: 'AM_CHECKIN' },
  { header: 'AM-CHECKOUT', field: 'AM_CHECKOUT' },
  { header: 'PM-CHECKIN', field: 'PM_CHECKIN' },
  { header: 'PM-CHECKOUT', field: 'PM_CHECKOUT' },
  { header: 'LATE', field: 'LATE' },
  { header: 'TOTAL HOURS', field: 'TOTAL_HOURS' },
  { header: 'REMARKS', field: 'REMARKS' }
];

const PrintPreview = ({ logs = [], selectedEmployee, onClose }) => {
  const printRef = useRef();

  // Totals
  const totalLate = logs.reduce((sum, log) => sum + (Number(log.LATE) || 0), 0);
  const totalHours = logs.reduce((sum, log) => sum + (Number(log.TOTAL_HOURS) || 0), 0);
  const majorityMonth = getMajorityMonth(logs);

  // Print on mount
  useEffect(() => {
    setTimeout(() => {
      if (printRef.current) {
        window.print();
      }
    }, 500);
  }, []);

  return (
    <div className="print-preview-modal fixed inset-0 bg-white z-50 overflow-auto p-8">
      <div ref={printRef}>
        {/* Header */}
        {selectedEmployee && (
          <div className="mb-6 border-b pb-4">
            <div className="text-center font-semibold text-xs tracking-wide mb-2">
              CIVIL SERVICE FORM NO. 48
            </div>
            <div className="text-center text-2xl font-bold mb-4" style={{ letterSpacing: '2px' }}>
              DAILY TIME RECORD
            </div>
            <div className="mb-2 text-sm">
              <span className="font-semibold">NAME:</span> {selectedEmployee.NAME}
            </div>
            <div className="mb-2 text-sm">
              <span className="font-semibold">For the month of:</span> {majorityMonth}
            </div>
            <div className="mb-2 text-sm">
              Office hours of arrival (Regular days <span className="inline-block border-b border-gray-400" style={{ minWidth: 100 }}>&nbsp;</span>) and departure (Saturdays <span className="inline-block border-b border-gray-400" style={{ minWidth: 150 }}>&nbsp;</span>)
            </div>
            <div className="mb-2 text-sm">
              <span className="font-semibold">Department:</span> {selectedEmployee.DEPTNAME || 'No Department'}
            </div>
          </div>
        )}

        {/* Table */}
        {selectedEmployee && logs.length > 0 ? (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="min-w-full table-auto border border-gray-300 shadow-sm mb-6">
              <thead className="bg-gray-100 text-sm text-gray-700">
                <tr>
                  {columns.map(col => (
                    <th key={col.field} className="border px-4 py-2">{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((row, idx) => (
                  <tr key={idx} className="text-center text-sm">
                    {columns.map(col => {
                      if (col.field === 'REMARKS') {
                        const dateObj = new Date(row.DATE);
                        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                        const [firstRemark, ...restRemarks] = (row.REMARKS || '').split(';').map(s => s.trim()).filter(Boolean);
                        return (
                          <td key={col.field} className="border px-4 py-2 text-left">
                            {isWeekend ? (
                              <>
                                <span className="text-blue-600 font-semibold">Weekend</span>
                                {row.REMARKS
                                  ? restRemarks.length > 0
                                    ? <>; {restRemarks.join('; ')}</>
                                    : firstRemark && firstRemark !== 'Weekend'
                                      ? <>; {firstRemark}</>
                                      : null
                                  : null}
                              </>
                            ) : (
                              row.REMARKS
                            )}
                          </td>
                        );
                      }
                      return <td key={col.field} className="border px-4 py-2">{row[col.field]}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-100">
                  <td className="border px-4 py-2 text-right" colSpan={5}>TOTAL</td>
                  <td className="border px-4 py-2">{totalLate}</td>
                  <td className="border px-4 py-2">{totalHours}</td>
                  <td className="border px-4 py-2"></td>
                </tr>
              </tfoot>
            </table>
            {/* Certification and Verification Section */}
            <div className="mt-8 text-sm">
              <div className="mb-6">
                <span className="block mb-2 font-semibold">
                  I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival at and departure from office.
                </span>
              </div>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between mt-8">
                <div className="mb-6 md:mb-0">
                  <span className="block font-semibold">
                    Verified as to the prescribed office hours.
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="block mb-2" style={{ minWidth: 200, borderBottom: '1px solid #333', height: 24 }}>&nbsp;</span>
                  <span className="block mb-2" style={{ minWidth: 200, borderBottom: '1px solid #333', height: 24 }}>&nbsp;</span>
                  <span className="block font-semibold">In Charge</span>
                </div>
              </div>
            </div>
          </div>
        ) : selectedEmployee ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">
              No logs found for the selected date range.
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-600">Please select an employee to view their time logs.</p>
          </div>
        )}
      </div>
      <div className="text-center mt-8 print:hidden">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700"
        >
          Close Preview
        </button>
      </div>
    </div>
  );
};

export default PrintPreview;