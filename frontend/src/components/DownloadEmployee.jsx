import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const DownloadEmployee = () => {
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  
  // New state for bulk selection
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [downloadingSelected, setDownloadingSelected] = useState(false);

  // Fetch machines on component mount
  useEffect(() => {
    fetchMachines();
  }, []);

  // Fetch employees when machine is selected
  useEffect(() => {
    if (selectedMachine) {
      fetchEmployeesFromMachine();
    }
  }, [selectedMachine]);

  // Clear selections when machine changes
  useEffect(() => {
    setSelectedEmployees([]);
  }, [selectedMachine]);

  const fetchMachines = async () => {
    try {
      const response = await api.get('/machines');
      if (response.data.success) {
        setMachines(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching machines:', error);
    }
  };

  const fetchEmployeesFromMachine = async () => {
    if (!selectedMachine) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/machines/${selectedMachine}/users`);
      if (response.data.success) {
        setEmployees(response.data.data);
        console.log(`Found ${response.data.data.length} users not in database`);
        console.log(`Total machine users: ${response.data.totalMachineUsers}`);
        console.log(`Total database users: ${response.data.totalDatabaseUsers}`);
      }
    } catch (error) {
      console.error('Error fetching employees from machine:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle individual employee selection
  const handleEmployeeSelect = (employeeId, isSelected) => {
    if (isSelected) {
      setSelectedEmployees(prev => [...prev, employeeId]);
    } else {
      setSelectedEmployees(prev => prev.filter(id => id !== employeeId));
    }
  };

  // Handle select all employees
  const handleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(emp => emp.userId || emp.PIN));
    }
  };

  const downloadEmployee = async (employee) => {
    if (!selectedMachine) return;
    
    setDownloading(prev => ({ ...prev, [employee.PIN || employee.userId]: true }));
    
    try {
      const response = await api.post(`/machines/${selectedMachine}/download-employee`, {
        userId: employee.PIN || employee.userId, // Use PIN as the BADGENUMBER
        employeeData: employee
      });
      
      if (response.data.success) {
        alert(`Employee ${employee.Name || employee.name} downloaded successfully!`);
        // Refresh the list to remove the downloaded employee
        fetchEmployeesFromMachine();
      } else {
        alert(`Error downloading employee: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error downloading employee:', error);
      alert(`Error downloading employee: ${error.response?.data?.message || error.message}`);
    } finally {
      setDownloading(prev => ({ ...prev, [employee.PIN || employee.userId]: false }));
    }
  };

  // Handle bulk download for selected employees
  const handleDownloadSelected = async () => {
    if (selectedEmployees.length === 0) {
      alert('Please select employees to download');
      return;
    }
    
    setDownloadingSelected(true);
    
    try {
      const downloadPromises = selectedEmployees.map(employeeId => {
        const employee = employees.find(emp => (emp.PIN || emp.userId) === employeeId);
        if (employee) {
          return api.post(`/machines/${selectedMachine}/download-employee`, {
            userId: employee.PIN || employee.userId, // Use PIN as the BADGENUMBER
            employeeData: employee
          });
        }
        return Promise.resolve();
      });
      
      await Promise.all(downloadPromises);
      
      alert(`Successfully downloaded ${selectedEmployees.length} employees!`);
      setSelectedEmployees([]);
      fetchEmployeesFromMachine();
    } catch (error) {
      console.error('Error downloading selected employees:', error);
      alert(`Error downloading employees: ${error.response?.data?.message || error.message}`);
    } finally {
      setDownloadingSelected(false);
    }
  };

  const filteredEmployees = employees.filter(employee =>
    (employee.Name || employee.name)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (employee.PIN || employee.userId)?.toString().includes(searchTerm)
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Download Employee</h1>
        <p className="text-gray-600">Download employee data from selected ZKTeco machine to database (only shows users not already in database)</p>
      </div>

      {/* Machine Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Machine</h2>
        <div className="flex gap-4 items-center">
          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a machine...</option>
            {machines.map((machine) => (
              <option key={machine.ID} value={machine.ID}>
                {machine.MachineAlias} ({machine.IP})
              </option>
            ))}
          </select>
          {selectedMachine && (
            <button
              onClick={fetchEmployeesFromMachine}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Download Selected Button */}
      {selectedMachine && selectedEmployees.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleDownloadSelected}
            disabled={downloadingSelected || selectedEmployees.length === 0}
            className={`px-6 py-3 rounded-md font-medium ${
              downloadingSelected || selectedEmployees.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {downloadingSelected ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downloading Selected...
              </>
            ) : (
              <>
                <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Selected {selectedEmployees.length > 1 ? 'Employees' : 'Employee'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Search and Employee List */}
      {selectedMachine && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Employees from Machine NOT in Database ({employees.length})
              </h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSelectAll}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  {selectedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                </button>
                <input
                  type="text"
                  placeholder="Search by badge number or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Badge Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.userId || employee.PIN} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(employee.userId || employee.PIN)}
                        onChange={(e) => handleEmployeeSelect(employee.userId || employee.PIN, e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.PIN || employee.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.Name || employee.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.Enabled !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.Enabled !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        onClick={() => downloadEmployee(employee)}
                        disabled={downloading[employee.PIN || employee.userId]}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading[employee.PIN || employee.userId] ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Downloading...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No employees found matching your search.' : 'No employees found on this machine that are not in the database.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DownloadEmployee;