import React from 'react';

const PayrollProcessing = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg shadow-lg p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">Payroll Processing</h2>
        <p className="text-purple-100">Process and compute employee salaries</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">💳 Payroll Processing Workflow</h3>
        
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">1</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Attendance Verification</h4>
              <p className="text-sm text-gray-600">Verify and finalize DTR records for the payroll period</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>

          {/* Step 2 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">2</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Salary Computation</h4>
              <p className="text-sm text-gray-600">Calculate gross pay based on rate and attendance</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>

          {/* Step 3 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">3</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Deductions Processing</h4>
              <p className="text-sm text-gray-600">Apply mandatory deductions and contributions</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>

          {/* Step 4 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">4</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Net Pay Calculation</h4>
              <p className="text-sm text-gray-600">Compute final take-home pay</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>

          {/* Step 5 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">5</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Payslip Generation</h4>
              <p className="text-sm text-gray-600">Generate and distribute payslips to employees</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>

          {/* Step 6 */}
          <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-purple-600 font-bold">6</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Payment Distribution</h4>
              <p className="text-sm text-gray-600">Release payments via bank transfer or cash</p>
            </div>
            <button className="px-4 py-2 bg-gray-200 text-gray-400 rounded-md cursor-not-allowed" disabled>
              Coming Soon
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-semibold text-gray-900 mb-3">📊 Current Payroll Period</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Start Date:</strong> Not set</p>
            <p><strong>End Date:</strong> Not set</p>
            <p><strong>Pay Date:</strong> Not set</p>
            <p><strong>Status:</strong> <span className="text-gray-400">Inactive</span></p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-semibold text-gray-900 mb-3">💰 Payroll Summary</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Employees:</strong> 0</p>
            <p><strong>Gross Pay:</strong> ₱ 0.00</p>
            <p><strong>Total Deductions:</strong> ₱ 0.00</p>
            <p><strong>Net Pay:</strong> ₱ 0.00</p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Development Status:</strong> Payroll processing functionality is under development and will be available in the next system update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollProcessing;

