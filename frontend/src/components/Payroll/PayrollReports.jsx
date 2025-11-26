import React from 'react';

const PayrollReports = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">Payroll Reports</h2>
        <p className="text-indigo-100">Generate and view payroll-related reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Payroll Register */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Payroll Register</h3>
          <p className="text-sm text-gray-600 mb-4">Complete list of all employee salaries for a period</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* Payslips */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Employee Payslips</h3>
          <p className="text-sm text-gray-600 mb-4">Individual payslips with earnings and deductions</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* BIR Report */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">BIR Reports</h3>
          <p className="text-sm text-gray-600 mb-4">Tax reports for BIR submission (2316, Alphalist)</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* SSS Report */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">SSS Report</h3>
          <p className="text-sm text-gray-600 mb-4">Social Security contributions report</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* PhilHealth Report */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">PhilHealth Report</h3>
          <p className="text-sm text-gray-600 mb-4">Health insurance contributions report</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* Pag-IBIG Report */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pag-IBIG Report</h3>
          <p className="text-sm text-gray-600 mb-4">HDMF contributions report</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* 13th Month Pay */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">13th Month Pay</h3>
          <p className="text-sm text-gray-600 mb-4">Annual 13th month pay computation</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* Loan Report */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loans & Advances</h3>
          <p className="text-sm text-gray-600 mb-4">Employee loans and salary advances report</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>

        {/* Payroll History */}
        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Payroll History</h3>
          <p className="text-sm text-gray-600 mb-4">Historical payroll records and audit trail</p>
          <button className="w-full px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
            Coming Soon
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📑 Report Templates</h3>
        <p className="text-gray-600 mb-4">
          All payroll reports will be available for export in multiple formats:
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-medium">PDF</span>
          <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">Excel (XLSX)</span>
          <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">CSV</span>
          <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">Print</span>
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              <strong>Integration:</strong> Payroll reports will automatically pull data from the DTR system and employee 201 files for accurate calculations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollReports;

