import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const UploadEmployee = () => {
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [departments, setDepartments] = useState([]); // Ensure it's initialized as an array
  const [uploadProgress, setUploadProgress] = useState({
    currentStep: '',
    percentage: 0,
    message: '',
    details: '',
    employeesProcessed: 0,
    totalEmployees: 0,
    errors: []
  });
  const [uploadResult, setUploadResult] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  
  // New state for not uploaded employees view
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'not-uploaded'
  const [notUploadedEmployees, setNotUploadedEmployees] = useState([]);
  const [loadingNotUploaded, setLoadingNotUploaded] = useState(false);
  const [selectedMachineForScan, setSelectedMachineForScan] = useState('');
  const [showScanButton, setShowScanButton] = useState(false);
  
  // New state for not uploaded employees selection
  const [selectedNotUploadedEmployees, setSelectedNotUploadedEmployees] = useState([]);
  const [uploadingNotUploaded, setUploadingNotUploaded] = useState(false);

  // New state for biometric templates
  const [biometricTemplates, setBiometricTemplates] = useState([]);
  const [loadingBiometrics, setLoadingBiometrics] = useState(false);
  const [usersWithBiometrics, setUsersWithBiometrics] = useState([]);
  const [loadingUsersWithBiometrics, setLoadingUsersWithBiometrics] = useState(false);
  const [showUploadOptionsModal, setShowUploadOptionsModal] = useState(false);
  const [uploadOptions, setUploadOptions] = useState({
  userInfo: true,      // Basic user info (always enabled by default)
  fingerprints: true,  // Fingerprint templates
  face: true          // Face templates
});
const [uploadContext, setUploadContext] = useState('all'); // 'all' or 'not-uploaded' or 'individual'
const [individualEmployee, setIndividualEmployee] = useState(null); // Store individual employee for upload

  // Fetch employees, machines, and departments on component mount
  useEffect(() => {
    fetchEmployees();
    fetchMachines();
    fetchDepartments();
  }, []);

  // Show scan button when machine is selected in not-uploaded mode
  useEffect(() => {
    if (viewMode === 'not-uploaded' && selectedMachineForScan) {
      setShowScanButton(true);
    } else {
      setShowScanButton(false);
    }
  }, [viewMode, selectedMachineForScan]);

  // Clear selections when switching view modes
  useEffect(() => {
    if (viewMode === 'not-uploaded') {
      setSelectedNotUploadedEmployees([]);
    } else {
      setSelectedEmployees([]);
    }
  }, [viewMode]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get('/employees');
      // Handle response structure: { success: true, data: [...] }
      if (response.data && Array.isArray(response.data.data)) {
        setEmployees(response.data.data);
        // Debug: Check if biometric counts are in the data
        if (response.data.data.length > 0) {
          console.log('=== FRONTEND BIOMETRIC DEBUG ===');
          const sampleEmployee = response.data.data[0];
          console.log('Sample employee from API:', {
            NAME: sampleEmployee.NAME,
            FINGER_COUNT: sampleEmployee.FINGER_COUNT,
            FACE_COUNT: sampleEmployee.FACE_COUNT,
            hasFingerCount: 'FINGER_COUNT' in sampleEmployee,
            hasFaceCount: 'FACE_COUNT' in sampleEmployee
          });
          console.log('All available fields:', Object.keys(sampleEmployee));
        }
      } else if (Array.isArray(response.data)) {
        setEmployees(response.data);
        // Debug: Check if biometric counts are in the data
        if (response.data.length > 0) {
          console.log('=== FRONTEND BIOMETRIC DEBUG ===');
          const sampleEmployee = response.data[0];
          console.log('Sample employee from API:', {
            NAME: sampleEmployee.NAME,
            FINGER_COUNT: sampleEmployee.FINGER_COUNT,
            FACE_COUNT: sampleEmployee.FACE_COUNT,
            hasFingerCount: 'FINGER_COUNT' in sampleEmployee,
            hasFaceCount: 'FACE_COUNT' in sampleEmployee
          });
          console.log('All available fields:', Object.keys(sampleEmployee));
        }
      } else {
        console.warn('Employees response is not an array:', response.data);
        setEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  // New function to fetch employees not yet uploaded to selected machine
  const fetchNotUploadedEmployees = async () => {
    if (!selectedMachineForScan) return;
    
    try {
      setLoadingNotUploaded(true);
      
      console.log(`Fetching not uploaded employees for machine: ${selectedMachineForScan}`);
      
      // Increase timeout for machine connection (60 seconds to match backend)
      const response = await api.get(`/machines/${selectedMachineForScan}/not-uploaded-employees`, {
        timeout: 60000 // 60 seconds timeout to match backend
      });
      
      console.log('Response received:', response.data);
      
      if (response.data.success && response.data.data) {
        setNotUploadedEmployees(response.data.data);
        console.log(`Successfully fetched ${response.data.data.length} not uploaded employees`);
        console.log('Sample not uploaded employees:', response.data.data.slice(0, 3));
      } else {
        console.error('Invalid response format:', response.data);
        setNotUploadedEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching not uploaded employees:', error);
      
      // Handle different types of errors with more specific messages
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('Machine connection timeout - the biometric device may be offline or unreachable');
        alert('Connection timeout: The biometric device may be offline or unreachable. Please check the device connection and try again.');
        setNotUploadedEmployees([]);
      } else if (error.response?.status === 404) {
        console.error('Machine not found');
        alert('Machine not found. Please select a valid machine.');
        setNotUploadedEmployees([]);
      } else if (error.response?.status === 500) {
        console.error('Server error:', error.response.data?.message);
        alert(`Server error: ${error.response.data?.message || 'Failed to connect to the biometric device'}`);
        setNotUploadedEmployees([]);
      } else {
        console.error('Unknown error:', error.message);
        alert(`Error: ${error.message}`);
        setNotUploadedEmployees([]);
      }
    } finally {
      setLoadingNotUploaded(false);
    }
  };

  const fetchMachines = async () => {
    try {
      const response = await api.get('/machines');
      // Handle response structure: { success: true, data: [...] }
      if (response.data && Array.isArray(response.data.data)) {
        setMachines(response.data.data);
      } else if (Array.isArray(response.data)) {
        setMachines(response.data);
      } else {
        console.warn('Machines response is not an array:', response.data);
        setMachines([]);
      }
    } catch (error) {
      console.error('Error fetching machines:', error);
      setMachines([]); // Set empty array on error
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      // Handle response structure: { success: true, data: [...] }
      if (response.data && Array.isArray(response.data.data)) {
        setDepartments(response.data.data);
      } else if (Array.isArray(response.data)) {
        setDepartments(response.data);
      } else {
        console.warn('Departments response is not an array:', response.data);
        setDepartments([]);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments([]); // Set empty array on error
    }
  };

  // Handle employee selection for not uploaded employees
  const handleNotUploadedEmployeeSelect = (employeeId, isSelected) => {
    if (isSelected) {
      setSelectedNotUploadedEmployees(prev => [...prev, employeeId]);
    } else {
      setSelectedNotUploadedEmployees(prev => prev.filter(id => id !== employeeId));
    }
  };

  // Handle select all for not uploaded employees
  const handleSelectAllNotUploaded = () => {
    if (selectedNotUploadedEmployees.length === filteredEmployees.length) {
      setSelectedNotUploadedEmployees([]);
    } else {
      setSelectedNotUploadedEmployees(filteredEmployees.map(emp => emp.USERID));
    }
  };

  // Handle individual employee upload for not uploaded employees
  // Handle individual employee upload for not uploaded employees
const handleIndividualUpload = (employee) => {
  showUploadOptions('individual', employee);
};

  // Handle bulk upload for selected not uploaded employees
  // Handle bulk upload for selected not uploaded employees
const handleUploadSelectedNotUploaded = () => {
  showUploadOptions('not-uploaded');
};

  // Existing functions for regular employee upload...
  const handleEmployeeSelect = (employeeId, isSelected) => {
    if (isSelected) {
      setSelectedEmployees(prev => [...prev, employeeId]);
    } else {
      setSelectedEmployees(prev => prev.filter(id => id !== employeeId));
    }
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(emp => emp.USERID));
    }
  };

 // Show upload options modal - can be called from different contexts
const showUploadOptions = (context = 'all', employee = null) => {
  // Validate based on context
  if (context === 'all') {
    if (selectedEmployees.length === 0) {
      alert('Please select employees to upload');
      return;
    }
    if (!selectedMachine) {
      alert('Please select a machine');
      return;
    }
  } else if (context === 'not-uploaded') {
    if (selectedNotUploadedEmployees.length === 0) {
      alert('Please select employees to upload');
      return;
    }
    if (!selectedMachineForScan) {
      alert('Please select a machine first');
      return;
    }
  } else if (context === 'individual') {
    if (!employee) {
      alert('No employee selected');
      return;
    }
    if (!selectedMachineForScan) {
      alert('Please select a machine first');
      return;
    }
  }

  // Set context and employee
  setUploadContext(context);
  setIndividualEmployee(employee);
  
  // Open the options modal
  setShowUploadOptionsModal(true);
};

// Handle upload with selected options
const handleUploadWithOptions = async () => {
  // Close the modal
  setShowUploadOptionsModal(false);

  // Determine which employees to upload and which machine
  let employeesToUpload = [];
  let targetMachine = null;

  if (uploadContext === 'all') {
    employeesToUpload = selectedEmployees;
    targetMachine = selectedMachine;
  } else if (uploadContext === 'not-uploaded') {
    employeesToUpload = selectedNotUploadedEmployees;
    targetMachine = selectedMachineForScan;
  } else if (uploadContext === 'individual') {
    employeesToUpload = [individualEmployee.USERID];
    targetMachine = selectedMachineForScan;
  }

  try {
    if (uploadContext === 'all') {
      setUploading(true);
      setShowProgressModal(true);
    } else {
      setUploadingNotUploaded(true);
    }
    
    if (uploadContext === 'all') {
      setUploadProgress({
        currentStep: 'Starting upload...',
        percentage: 0,
        message: 'Preparing to upload employees',
        details: '',
        employeesProcessed: 0,
        totalEmployees: employeesToUpload.length,
        errors: []
      });
    }

    // Prepare upload options string for display
    const optionsText = [
      uploadOptions.userInfo ? 'User Info' : null,
      uploadOptions.fingerprints ? 'Fingerprints' : null,
      uploadOptions.face ? 'Face Templates' : null
    ].filter(Boolean).join(', ');

    if (uploadContext === 'all') {
      setUploadProgress(prev => ({
        ...prev,
        details: `Uploading: ${optionsText}`
      }));
    }

    // Choose endpoint based on options
    const endpoint = (uploadOptions.fingerprints || uploadOptions.face)
      ? `/machines/${targetMachine}/upload-employees-biometrics`
      : `/machines/${targetMachine}/upload-employees`;

    const response = await api.post(endpoint, {
      employeeIds: employeesToUpload,
      includeBiometrics: uploadOptions.fingerprints || uploadOptions.face,
      includeFingerprints: uploadOptions.fingerprints,
      includeFace: uploadOptions.face
    });

    if (response.data.success) {
      if (uploadContext === 'all') {
        const details = response.data.details;
        const successMsg = details 
          ? `Successfully uploaded ${details.successCount || employeesToUpload.length} employees\nFingerprints: ${uploadOptions.fingerprints ? 'Yes' : 'No'}\nFace Templates: ${uploadOptions.face ? 'Yes' : 'No'}`
          : `Successfully uploaded ${employeesToUpload.length} employees`;

        setUploadResult({
          success: true,
          message: successMsg,
          details: details || ''
        });
        setUploadProgress(prev => ({
          ...prev,
          percentage: 100,
          currentStep: 'Upload completed',
          message: 'All employees uploaded successfully'
        }));
      } else {
        // For not-uploaded context
        const count = employeesToUpload.length;
        const employeeName = uploadContext === 'individual' ? individualEmployee.NAME : `${count} employee${count > 1 ? 's' : ''}`;
        alert(`${employeeName} uploaded successfully with:\n${optionsText}`);
        
        // Clear selections and refresh the list
        if (uploadContext !== 'individual') {
          setSelectedNotUploadedEmployees([]);
        }
        await fetchNotUploadedEmployees();
      }
    } else {
      if (uploadContext === 'all') {
        setUploadResult({
          success: false,
          message: 'Upload failed',
          details: response.data.message || 'Unknown error occurred'
        });
      } else {
        alert(`Failed to upload: ${response.data.message}`);
      }
    }
  } catch (error) {
    console.error('Error uploading employees:', error);
    if (uploadContext === 'all') {
      setUploadResult({
        success: false,
        message: 'Upload failed',
        details: error.response?.data?.error || error.response?.data?.message || error.message
      });
    } else {
      alert(`Error uploading: ${error.response?.data?.message || error.message}`);
    }
  } finally {
    if (uploadContext === 'all') {
      setUploading(false);
    } else {
      setUploadingNotUploaded(false);
    }
  }
};
  // Filter employees based on current view mode
  const getFilteredEmployees = () => {
    // Ensure we have arrays to work with
    let baseEmployees = viewMode === 'not-uploaded' 
      ? (notUploadedEmployees || []) 
      : (employees || []);
    
    // Additional safety check
    if (!Array.isArray(baseEmployees)) {
      console.warn('baseEmployees is not an array:', baseEmployees);
      return [];
    }
    
    return baseEmployees.filter(employee => {
      const matchesSearch = 
        employee.NAME?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.SSN?.toString().includes(searchTerm) ||
        employee.USERID?.toString().includes(searchTerm) ||
        employee.BADGENUMBER?.toString().includes(searchTerm);
      
      const matchesDepartment = 
        filterDepartment === 'all' || 
        employee.DEFAULTDEPTID?.toString() === filterDepartment;
      
      return matchesSearch && matchesDepartment;
    });
  };

  const filteredEmployees = getFilteredEmployees();

  // Fetch biometric templates from selected machine
  const fetchBiometricTemplates = async () => {
    if (!selectedMachine) {
      alert('Please select a machine first');
      return;
    }

    try {
      setLoadingBiometrics(true);
      const response = await api.get(`/machines/${selectedMachine}/biometric-templates`);
      
      if (response.data.success) {
        setBiometricTemplates(response.data.data);
        console.log('Biometric templates:', response.data.data);
      } else {
        console.error('Failed to fetch biometric templates:', response.data.message);
        setBiometricTemplates([]);
      }
    } catch (error) {
      console.error('Error fetching biometric templates:', error);
      setBiometricTemplates([]);
    } finally {
      setLoadingBiometrics(false);
    }
  };

  // Fetch users with biometric data from selected machine
  const fetchUsersWithBiometrics = async () => {
    if (!selectedMachine) {
      alert('Please select a machine first');
      return;
    }

    try {
      setLoadingUsersWithBiometrics(true);
      const response = await api.get(`/machines/${selectedMachine}/users-with-biometrics`);
      
      if (response.data.success) {
        setUsersWithBiometrics(response.data.data);
        console.log('Users with biometrics:', response.data.data);
      } else {
        console.error('Failed to fetch users with biometrics:', response.data.message);
        setUsersWithBiometrics([]);
      }
    } catch (error) {
      console.error('Error fetching users with biometrics:', error);
      setUsersWithBiometrics([]);
    } finally {
      setLoadingUsersWithBiometrics(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Employee Upload Management</h1>
        <p className="text-gray-600 mt-2">Upload employees to biometric machines</p>
      </div>

      {/* View Mode Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setViewMode('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                viewMode === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All Employees
            </button>
            <button
              onClick={() => setViewMode('not-uploaded')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                viewMode === 'not-uploaded'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Not Uploaded Employees
            </button>
          </nav>
        </div>
      </div>

      {/* Machine Selection for Not Uploaded Employees */}
      {viewMode === 'not-uploaded' && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Machine to Scan</h3>
          <div className="flex items-center space-x-4">
            <select
              value={selectedMachineForScan}
              onChange={(e) => setSelectedMachineForScan(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a machine...</option>
              {machines.map((machine) => (
                <option key={machine.ID} value={machine.ID}>
                  {machine.MachineAlias} ({machine.IP}:{machine.Port})
                </option>
              ))}
            </select>
            {showScanButton && (
              <button
                onClick={fetchNotUploadedEmployees}
                disabled={loadingNotUploaded}
                className={`px-4 py-2 rounded-md font-medium ${
                  loadingNotUploaded
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loadingNotUploaded ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Scan Employees
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Machine Selection for Upload - Only show in all mode */}
      {viewMode === 'all' && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Target Machine</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {machines.map((machine) => (
              <div
                key={machine.ID}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedMachine === machine.ID.toString()
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMachine(machine.ID.toString())}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{machine.MachineAlias}</h4>
                    <p className="text-sm text-gray-600">{machine.IP}:{machine.Port}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${
                    selectedMachine === machine.ID.toString() ? 'bg-blue-500' : 'bg-gray-300'
                  }`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Employee
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SSN, ID, or badge number..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Departments</option>
              {Array.isArray(departments) && departments.map((dept) => (
                <option key={dept.DEPTID} value={dept.DEPTID}>
                  {dept.DEPTNAME}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upload Selected Button for Not Uploaded Employees */}
      {viewMode === 'not-uploaded' && selectedNotUploadedEmployees.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleUploadSelectedNotUploaded}
            disabled={uploadingNotUploaded || selectedNotUploadedEmployees.length === 0}
            className={`px-6 py-3 rounded-md font-medium ${
              uploadingNotUploaded || selectedNotUploadedEmployees.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {uploadingNotUploaded ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Selected {selectedNotUploadedEmployees.length > 1 ? 'Employees' : 'Employee'}
              </>
            )}
          </button>
        </div>
      )}

      {/* New Biometric Templates Section */}
      {viewMode === 'all' && selectedMachine && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Biometric Templates</h3>
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={fetchBiometricTemplates}
              disabled={loadingBiometrics}
              className={`px-4 py-2 rounded-md font-medium ${
                loadingBiometrics
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {loadingBiometrics ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Get Biometric Templates
                </>
              )}
            </button>
            
            <button
              onClick={fetchUsersWithBiometrics}
              disabled={loadingUsersWithBiometrics}
              className={`px-4 py-2 rounded-md font-medium ${
                loadingUsersWithBiometrics
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {loadingUsersWithBiometrics ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Get Users with Biometrics
                </>
              )}
            </button>
          </div>

          {/* Biometric Templates Display */}
          {biometricTemplates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-semibold text-gray-800 mb-3">
                Biometric Templates ({biometricTemplates.length} found)
              </h4>
              <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {biometricTemplates.slice(0, 20).map((template, index) => (
                    <div key={index} className="bg-white p-3 rounded border">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {template.name || template.userId || 'Unknown User'}
                        </div>
                        <div className="text-gray-600">
                          PIN: {template.pin || template.userId || 'N/A'}
                        </div>
                        <div className="text-gray-600">
                          Type: {template.templateType || 'Unknown'}
                        </div>
                        <div className="text-gray-600">
                          Size: {template.templateSize || 0} bytes
                        </div>
                        {template.fingerId !== undefined && (
                          <div className="text-gray-600">
                            Finger ID: {template.fingerId}
                          </div>
                        )}
                        {template.faceId !== undefined && (
                          <div className="text-gray-600">
                            Face ID: {template.faceId}
                          </div>
                        )}
                        <div className="text-gray-600">
                          Valid: {template.valid ? 'Yes' : 'No'}
                        </div>
                        <div className="text-gray-600">
                          Method: {template.method || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {biometricTemplates.length > 20 && (
                  <div className="text-center text-gray-500 text-sm mt-2">
                    Showing first 20 of {biometricTemplates.length} templates
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Users with Biometrics Display */}
          {usersWithBiometrics.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-semibold text-gray-800 mb-3">
                Users with Biometric Data ({usersWithBiometrics.length} found)
              </h4>
              <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                <div className="space-y-3">
                  {usersWithBiometrics.slice(0, 10).map((user, index) => (
                    <div key={index} className="bg-white p-3 rounded border">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {user.Name || user.name || 'Unknown User'}
                          </div>
                          <div className="text-sm text-gray-600">
                            PIN: {user.PIN || user.pin || 'N/A'} | 
                            Badge: {user.BADGENUMBER || user.badgeNumber || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-600">
                            Templates: {user.templateCount || 0} | 
                            Fingerprints: {user.fingerprintTemplates?.length || 0} | 
                            Face: {user.faceTemplates?.length || 0}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {user.hasFingerprints && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Fingerprint
                            </span>
                          )}
                          {user.hasFace && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Face
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {usersWithBiometrics.length > 10 && (
                  <div className="text-center text-gray-500 text-sm mt-2">
                    Showing first 10 of {usersWithBiometrics.length} users
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Employee List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {viewMode === 'not-uploaded' 
                ? `Employees Not Uploaded to Selected Machine (${filteredEmployees.length})`
                : `Available Employees (${filteredEmployees.length})`
              }
            </h3>
            {viewMode === 'all' && (
              <button
                onClick={handleSelectAll}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                {selectedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {viewMode === 'not-uploaded' && (
              <button
                onClick={handleSelectAllNotUploaded}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                {selectedNotUploadedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>
        </div>

        {(loading || loadingNotUploaded) ? (
          <div className="p-8 text-center">
            <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            <p className="text-gray-600">
              {viewMode === 'not-uploaded' ? 'Scanning employees from machine...' : 'Loading employees...'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={
                        viewMode === 'all' 
                          ? (selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0)
                          : (selectedNotUploadedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0)
                      }
                      onChange={viewMode === 'all' ? handleSelectAll : handleSelectAllNotUploaded}
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
                    Department
                  </th>
                  {viewMode === 'all' && (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Finger Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Face Count
                      </th>
                    </>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Upload Status
                  </th>
                  {viewMode === 'not-uploaded' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.USERID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          viewMode === 'all' 
                            ? selectedEmployees.includes(employee.USERID)
                            : selectedNotUploadedEmployees.includes(employee.USERID)
                        }
                        onChange={(e) => 
                          viewMode === 'all' 
                            ? handleEmployeeSelect(employee.USERID, e.target.checked)
                            : handleNotUploadedEmployeeSelect(employee.USERID, e.target.checked)
                        }
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {employee.BADGENUMBER || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.NAME}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.DEPTNAME || 'N/A'}
                    </td>
                    {viewMode === 'all' && (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            employee.FINGER_COUNT > 0 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            {employee.FINGER_COUNT || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            employee.FACE_COUNT > 0 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            {employee.FACE_COUNT || 0}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.privilege >= 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.privilege >= 0 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                        Not Uploaded
                      </span>
                    </td>
                    {viewMode === 'not-uploaded' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleIndividualUpload(employee)}
                          disabled={uploadingNotUploaded}
                          className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                          title="Upload this employee to the machine"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
{/* Upload Options Modal */}
{showUploadOptionsModal && (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
    <div className="relative top-20 mx-auto p-5 border w-[500px] shadow-lg rounded-md bg-white">
      <div className="mt-3">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Select Data to Upload</h3>
          <button
            onClick={() => setShowUploadOptionsModal(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-6">
         <p className="text-sm text-gray-600 mb-4">
  Choose what data to upload to the biometric device for {
    uploadContext === 'individual' 
      ? `employee ${individualEmployee?.NAME || ''}` 
      : `the selected ${uploadContext === 'all' ? selectedEmployees.length : selectedNotUploadedEmployees.length} employee${(uploadContext === 'all' ? selectedEmployees.length : selectedNotUploadedEmployees.length) > 1 ? 's' : ''}`
  }:
</p>
          
          <div className="space-y-4">
            {/* User Info Option */}
            <div className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <input
                type="checkbox"
                id="upload-userinfo"
                checked={uploadOptions.userInfo}
                onChange={(e) => setUploadOptions(prev => ({ ...prev, userInfo: e.target.checked }))}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label htmlFor="upload-userinfo" className="font-medium text-gray-900 cursor-pointer">
                  Basic User Information
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Employee name, badge number, password/PIN, and privilege level
                </p>
              </div>
            </div>

            {/* Fingerprints Option */}
            <div className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                id="upload-fingerprints"
                checked={uploadOptions.fingerprints}
                onChange={(e) => setUploadOptions(prev => ({ ...prev, fingerprints: e.target.checked }))}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label htmlFor="upload-fingerprints" className="font-medium text-gray-900 cursor-pointer flex items-center">
                  Fingerprint Templates
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    Biometric
                  </span>
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Upload all enrolled fingerprint templates from database
                </p>
              </div>
            </div>

            {/* Face Template Option */}
            <div className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                id="upload-face"
                checked={uploadOptions.face}
                onChange={(e) => setUploadOptions(prev => ({ ...prev, face: e.target.checked }))}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label htmlFor="upload-face" className="font-medium text-gray-900 cursor-pointer flex items-center">
                  Face Templates
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    Biometric
                  </span>
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Upload face recognition templates from database
                </p>
              </div>
            </div>
          </div>

          {/* Warning if no options selected */}
          {!uploadOptions.userInfo && !uploadOptions.fingerprints && !uploadOptions.face && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex">
                <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-yellow-800">
                  Please select at least one option to upload
                </p>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShowUploadOptionsModal(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleUploadWithOptions}
            disabled={!uploadOptions.userInfo && !uploadOptions.fingerprints && !uploadOptions.face}
            className={`px-6 py-2 text-sm font-medium rounded-md ${
              (!uploadOptions.userInfo && !uploadOptions.fingerprints && !uploadOptions.face)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Start Upload
          </button>
        </div>
      </div>
    </div>
  </div>
)}
        {filteredEmployees.length === 0 && !loading && !loadingNotUploaded && (
          <div className="p-8 text-center">
            <p className="text-gray-500">
              {viewMode === 'not-uploaded' 
                ? 'No employees found. Click "Scan Employees" to check the selected machine.'
                : 'No employees found matching the current filters.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Upload Button - Only show in 'all' view mode */}
      {viewMode === 'all' && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={showUploadOptions}
            disabled={selectedEmployees.length === 0 || !selectedMachine || uploading}
            className={`px-6 py-3 rounded-md font-medium ${
              selectedEmployees.length === 0 || !selectedMachine || uploading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Selected ({selectedEmployees.length})
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Upload Progress</h3>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{uploadProgress.currentStep}</span>
                  <span>{uploadProgress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-2">
                {uploadProgress.message}
              </div>
              
              {uploadProgress.details && (
                <div className="text-xs text-gray-500 mb-2">
                  {uploadProgress.details}
                </div>
              )}
              
              {uploadProgress.employeesProcessed > 0 && (
                <div className="text-sm text-gray-600">
                  Processed: {uploadProgress.employeesProcessed} / {uploadProgress.totalEmployees}
                </div>
              )}
              
              {uploadResult && (
                <div className={`mt-4 p-3 rounded-md ${
                  uploadResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  <div className="font-medium">
                    {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
                  </div>
                  <div className="text-sm mt-1">
                    {uploadResult.details}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadEmployee;