import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

const EnrollEmployeeBio = () => {
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedFinger, setSelectedFinger] = useState(0);
  const [enrolledFingers, setEnrolledFingers] = useState([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState('');
  const [readerAvailable, setReaderAvailable] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [capturedTemplate, setCapturedTemplate] = useState(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, enrolled, not-enrolled
  
  const [captureSamples, setCaptureSamples] = useState([]); // Store multiple samples
  const [currentCaptureAttempt, setCurrentCaptureAttempt] = useState(0);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [captureProgress, setCaptureProgress] = useState('');
  const [currentSpecimen, setCurrentSpecimen] = useState(0);
  const [enrollmentId, setEnrollmentId] = useState(null);
  const progressIntervalRef = useRef(null);

  // helper: poll hardware until finger detected or timeout
  const waitForHardwareFinger = async ({ timeoutMs = 15000, pollMs = 500 }) => {
    const start = Date.now();
    setCaptureProgress('Waiting for finger… Place finger on scanner');
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await api.post('/auth/capture-fingerprint');
        const data = res?.data;
        if (data?.success && data.status === 'success' && data.securityLevel === 'hardware_biometric') {
          return data; // fresh template only on hardware presence
        }
        if (data?.status === 'no_finger') {
          setCaptureProgress('Place finger on scanner…');
        }
      } catch (e) {
        // ignore transient errors and continue polling
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error('Timeout: No finger detected on scanner');
  };

  const fingerNames = [
    'Right Thumb', 'Right Index', 'Right Middle', 'Right Ring', 'Right Little',
    'Left Thumb', 'Left Index', 'Left Middle', 'Left Ring', 'Left Little'
  ];

  // Function to get finger color based on enrollment status
  const getFingerColor = (fingerIndex) => {
    if (enrolledFingers.includes(fingerIndex)) {
      return '#10b981'; // Green for enrolled
    } else if (selectedFinger === fingerIndex) {
      return '#3b82f6'; // Blue for selected
    } else {
      return '#e5e7eb'; // Gray for not enrolled
    }
  };

  // Function to poll enrollment progress
  const pollEnrollmentProgress = async (enrollmentId) => {
    try {
      const response = await api.get(`/bio-enroll/enrollment-progress/${enrollmentId}`);
      
      if (response.data.success) {
        const progress = response.data;
        console.log('📈 Status:', progress.status);
        
        // Simplified status updates for DPFP.Gui enrollment
        if (progress.status === 'initializing' || progress.status === 'capturing') {
          setEnrollmentStatus('📱 DigitalPersona enrollment window is active');
          setCaptureProgress('Follow the instructions in the enrollment window...');
        } else if (progress.status === 'complete' || progress.status === 'captured') {
          console.log('✅ All samples captured - showing confirmation');
          console.log('📦 Template data:', {
            hasTemplateBase64: !!progress.templateBase64,
            samplesCollected: progress.samplesCollected,
            avgQuality: progress.avgQuality,
            userName: progress.userName
          });
          
          // Stop polling FIRST before any state updates
          if (progressIntervalRef.current) {
            console.log('⏹️ Stopping progress polling - enrollment complete');
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          
          // Store the enrollment data for confirmation
          const detectedFingerId = progress.detectedFinger || progress.fingerId;
          const templateData = {
            enrollmentId: enrollmentId,
            userId: progress.userId,
            fingerId: detectedFingerId,  // Use detected finger ID from SDK
            name: progress.userName,
            templateBase64: progress.templateBase64,
            samplesCollected: progress.samplesCollected || 3,
            avgQuality: progress.avgQuality || 95,
            qualityScores: progress.qualityScores || [95, 95, 95],
            templateSize: progress.templateSize
          };
          
          console.log('💾 Setting capturedTemplate:', templateData);
          console.log('👆 Detected finger:', fingerNames[detectedFingerId]);
          setCapturedTemplate(templateData);
          
          // Update selectedFinger to the detected finger
          setSelectedFinger(detectedFingerId);
          
          // Update UI
          setCurrentSpecimen(progress.samplesCollected || 3);
          setEnrollmentStatus(`✅ ${fingerNames[detectedFingerId]} captured successfully!`);
          setCaptureProgress(`Template size: ${progress.templateSize} bytes | Quality: ${progress.avgQuality || 95}%`);
          setIsEnrolling(false);
          
          // Show confirmation dialog
          console.log('🔔 Showing save confirmation modal...');
          setShowSaveConfirmation(true);
          
        } else if (progress.status === 'error') {
          // Stop polling and show error
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          
          setIsEnrolling(false); // Set to false on error
          setEnrollmentStatus(`❌ Enrollment failed: ${progress.error || 'Unknown error'}`);
          setCaptureProgress('');
          setCurrentSpecimen(0);
        }
      } else {
        // Progress not found or no longer available
        console.log('⚠️ Progress not found - stopping polling');
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    } catch (error) {
      // Handle 404 or other errors gracefully
      if (error.response?.status === 404) {
        console.log('⚠️ Progress not found (404) - stopping polling');
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      } else {
        console.warn('Progress polling error:', error.message);
      }
    }
  };

  // Cleanup effect for progress polling
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  // Initialize Bio Enrollment System
  useEffect(() => {
    const initializeReader = async () => {
      try {
        console.log('🔧 Initializing bio enrollment system...');
        
        // Test the bio enrollment API health check to see if the backend is ready
        const response = await api.get('/bio-enroll/health');
        
        if (response.data.success) {
          setReaderAvailable(true);
          setDeviceConnected(true);
          
          // Set device info if available
          if (response.data.deviceInfo) {
            setDeviceInfo(response.data.deviceInfo);
            const deviceModel = response.data.deviceInfo.model || response.data.deviceInfo.name;
            const deviceSerial = response.data.deviceInfo.serialNumber;
            setEnrollmentStatus(`✅ ${deviceModel} ready${deviceSerial !== 'Unknown' ? ` (SN: ${deviceSerial})` : ''}`);
            console.log('✅ Device detected:', deviceModel);
          } else {
            setEnrollmentStatus('✅ Bio enrollment system ready (No device detected)');
            console.log('⚠️ No device information available');
          }
          
          console.log('✅ Bio enrollment system initialized successfully');
          console.log('   SDK Ready:', response.data.sdkReady);
        } else {
          setEnrollmentStatus('⚠️ Bio enrollment system not available');
        }
      } catch (error) {
        console.error('Failed to initialize bio enrollment system:', error);
        setEnrollmentStatus('❌ Failed to initialize bio enrollment system');
        setReaderAvailable(false);
        setDeviceConnected(false);
      }
    };

    initializeReader();
    fetchEmployeesWithBioStatus();
  }, []);

  // Filter employees when search or filter changes
  useEffect(() => {
    filterEmployees();
  }, [searchTerm, statusFilter, employees]);

  const fetchEmployeesWithBioStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/biometric/employees-bio-status');
      setEmployees(response.data.employees || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = employees;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(emp => 
        emp.NAME?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.BADGENUMBER?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(emp => {
        if (statusFilter === 'enrolled') {
          return emp.BIO_COUNT > 0;
        } else if (statusFilter === 'not-enrolled') {
          return emp.BIO_COUNT === 0;
        }
        return true;
      });
    }

    setFilteredEmployees(filtered);
  };

  const fetchEnrolledFingers = async (userId) => {
    try {
      const response = await api.get(`/biometric/enrolled-fingers/${userId}`);
      setEnrolledFingers(response.data.fingers || []);
    } catch (error) {
      console.error('Error fetching enrolled fingers:', error);
      setEnrolledFingers([]);
    }
  };

  // Check finger availability when finger is selected
  const checkFingerAvailability = async (fingerId) => {
    if (!selectedEmployee) return;
    
    try {
      const response = await api.get(`/bio-enroll/check-finger/${selectedEmployee.USERID}/${fingerId}`);
      return response.data;
    } catch (error) {
      console.error('Error checking finger availability:', error);
      return { available: false, message: 'Failed to check availability' };
    }
  };

  // Handle finger selection with validation
  const handleFingerSelection = async (fingerId) => {
    if (isEnrolling) return;
    
    setSelectedFinger(fingerId);
    
    // Check availability and show status
    const availability = await checkFingerAvailability(fingerId);
    if (!availability.available) {
      if (availability.existingTemplate && availability.hasValidData) {
        setEnrollmentStatus(`⚠️ ${fingerNames[fingerId]} is already enrolled. Click "Start Enrollment" to re-enroll.`);
      } else {
        setEnrollmentStatus(`❌ ${fingerNames[fingerId]} cannot be enrolled: ${availability.message}`);
      }
    } else {
      setEnrollmentStatus(`✅ ${fingerNames[fingerId]} is available for enrollment`);
    }
  };

  const handleOpenEnrollModal = async (employee) => {
    setSelectedEmployee(employee);
    await fetchEnrolledFingers(employee.USERID);
    setSelectedFinger(0);
    setShowEnrollModal(true);
  };

  const handleCloseEnrollModal = () => {
    setShowEnrollModal(false);
    setSelectedEmployee(null);
    setEnrolledFingers([]);
    setEnrollmentStatus('✅ Reader ready');
    // Refresh employee list
    fetchEmployeesWithBioStatus();
  };

  const handleSaveEnrollment = async () => {
    if (!capturedTemplate) return;
    
    try {
      // Stop any remaining polling interval
      if (progressIntervalRef.current) {
        console.log('⏹️ Stopping progress polling before save');
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      setEnrollmentStatus('💾 Saving enrollment to database...');
      setCaptureProgress('Please wait...');
      
      console.log('💾 Saving captured template to database...');
      
      const response = await api.post('/bio-enroll/save-enrollment', capturedTemplate);
      
      if (response.data.success) {
        console.log('✅ Enrollment saved successfully:', response.data);
        
        // Update UI
        setEnrollmentStatus('✅ Fingerprint enrolled and saved successfully!');
        setCaptureProgress(`Saved with FUID: ${response.data.fuid}`);
        
        // Close confirmation dialog and clear states
        setShowSaveConfirmation(false);
        setCapturedTemplate(null);
        setEnrollmentId(null);  // Clear enrollment ID to stop any remaining polling
        
        // Update enrolled fingers list immediately
        await fetchEnrolledFingers(selectedEmployee.USERID);
        
        // Reset UI after delay
        setTimeout(() => {
          setCurrentSpecimen(0);
          setCaptureProgress('');
          setEnrollmentStatus('✅ Ready for next enrollment.');
          
          // Refresh employee list
          fetchEmployeesWithBioStatus();
        }, 2000);
        
      } else {
        throw new Error(response.data.message || 'Failed to save enrollment');
      }
      
    } catch (error) {
      console.error('Error saving enrollment:', error);
      setEnrollmentStatus(`❌ Failed to save enrollment: ${error.message}`);
      setCaptureProgress('');
      setShowSaveConfirmation(false);
      setCapturedTemplate(null);
      setEnrollmentId(null);  // Clear enrollment ID
      
      // Clear polling interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  };
  
  const handleStopEnrollment = () => {
    console.log('🛑 User stopped active enrollment');
    
    // Stop polling for progress
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
      console.log('⏰ Progress polling stopped');
    }
    
    // Reset all states
    setIsEnrolling(false);
    setEnrollmentId(null);
    setCurrentSpecimen(0);
    setCaptureProgress('');
    setShowSaveConfirmation(false);
    setCapturedTemplate(null);
    setEnrollmentStatus('⚠️ Enrollment cancelled by user during capture process.');
    
    // Note: PowerShell process will timeout naturally since we stopped polling
    console.log('✅ Enrollment process stopped and states reset');
    
    setTimeout(() => {
      setEnrollmentStatus('Ready for enrollment.');
    }, 3000);
  };
  
  const handleCancelEnrollment = () => {
    console.log('❌ User cancelled enrollment after capture');
    
    // Stop any remaining polling interval
    if (progressIntervalRef.current) {
      console.log('⏹️ Stopping progress polling - enrollment cancelled');
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    setShowSaveConfirmation(false);
    setCapturedTemplate(null);
    setEnrollmentId(null);  // Clear enrollment ID
    setCurrentSpecimen(0);
    setCaptureProgress('');
    setEnrollmentStatus('❌ Enrollment cancelled. Template not saved.');
    
    setTimeout(() => {
      setEnrollmentStatus('✅ Ready for enrollment.');
    }, 2000);
  };

  const handleDeleteFinger = async (fingerId) => {
    if (!selectedEmployee) return;

    if (!window.confirm(`Delete ${fingerNames[fingerId]} enrollment?\n\nThis will permanently remove this fingerprint from the system.`)) {
      return;
    }

    try {
      console.log(`🗑️ Deleting finger ${fingerId} for user ${selectedEmployee.USERID}...`);
      setEnrollmentStatus(`🗑️ Deleting ${fingerNames[fingerId]}...`);
      
      const response = await api.delete(`/biometric/delete-finger/${selectedEmployee.USERID}/${fingerId}`);
      
      if (response.data.success) {
        console.log(`✅ ${fingerNames[fingerId]} deleted successfully`);
        setEnrollmentStatus(`✅ ${fingerNames[fingerId]} deleted successfully`);
        
        // Refresh enrolled fingers list
        await fetchEnrolledFingers(selectedEmployee.USERID);
        
        // Refresh employee list to update bio count
        await fetchEmployeesWithBioStatus();
        
        setTimeout(() => {
          setEnrollmentStatus('✅ Ready for enrollment');
        }, 2000);
      }
    } catch (error) {
      console.error('Delete error:', error);
      setEnrollmentStatus(`❌ Failed to delete fingerprint: ${error.message}`);
    }
  };

  // Enhanced 3-Specimen Enrollment function with quality checking
  const handleEnrollFinger = async () => {
    if (!selectedEmployee || !deviceConnected) {
      setEnrollmentStatus('❌ No employee selected or bio enrollment system not available');
      return;
    }

    // Prevent multiple enrollment calls
    if (isEnrolling) {
      console.warn('⚠️ Enrollment already in progress, ignoring duplicate call');
      return;
    }

    // Note: DPFP.Gui will auto-detect which finger is placed on the scanner
    // No pre-validation needed since we don't know which finger will be scanned

    try {
      // Clear any existing polling interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      setIsEnrolling(true);
      setCurrentSpecimen(0);
      setEnrollmentStatus('📱 Opening DigitalPersona enrollment window...');
      setCaptureProgress('The enrollment window will appear shortly...');
      
      console.log('🎯 Enrollment state set - using DPFP.Gui UI Support');
      console.log('🔬 Starting bio enrollment process...');
      console.log('   Employee:', selectedEmployee.NAME, '(ID:', selectedEmployee.USERID, ')');
      console.log('   Finger:', fingerNames[selectedFinger], '(ID:', selectedFinger, ')');
      
      // Call the enhanced bio enrollment API with 3-specimen quality checking
      const response = await api.post('/bio-enroll/enroll-finger', {
        userId: selectedEmployee.USERID,
        fingerId: selectedFinger
      });
      
      if (response.data.success && response.data.enrollmentId) {
        console.log('✅ Enrollment started:', response.data);
        console.log('🔄 Setting up progress polling for enrollment ID:', response.data.enrollmentId);
          
        const enrollmentId = response.data.enrollmentId;
        setEnrollmentId(enrollmentId);
        setIsEnrolling(true);
          
        // Start polling for progress updates every 500ms for real-time feel
        progressIntervalRef.current = setInterval(() => {
          pollEnrollmentProgress(enrollmentId);
        }, 500);
          
        console.log('⏰ Progress polling interval set up for ID:', enrollmentId);
      } else {
        throw new Error(response.data.message || 'Enrollment failed to start');
      }
      
    } catch (error) {
      console.error('Enhanced enrollment error:', error);
      setEnrollmentStatus(`❌ Enrollment failed: ${error.message}`);
      setCaptureProgress('');
      setCurrentSpecimen(0);
      setIsEnrolling(false);
      
      // Stop polling for progress on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Enroll Employee Biometric</h2>
        <p className="text-gray-600">Manage employee fingerprints for web login authentication</p>
      </div>

      {/* Reader Status */}
      <div className={`mb-6 p-4 rounded-lg ${
        readerAvailable ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-3 ${readerAvailable ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
          <span className={`font-medium ${readerAvailable ? 'text-green-800' : 'text-yellow-800'}`}>
            {enrollmentStatus || 'Initializing...'}
          </span>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Search Box */}
          <div className="md:col-span-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by name or badge number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Employees</option>
              <option value="enrolled">With Bio Login</option>
              <option value="not-enrolled">No Bio Login</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredEmployees.length} of {employees.length} employees
        </div>
      </div>

      {/* Employees Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-gray-600">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No employees found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Badge Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.USERID} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {employee.BADGENUMBER}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.NAME}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {employee.BIO_COUNT > 0 ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          {employee.BIO_COUNT} finger{employee.BIO_COUNT > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          No bio login
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleOpenEnrollModal(employee)}
                        disabled={!readerAvailable}
                        className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          readerAvailable
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow hover:shadow-lg transform hover:scale-105'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        title="Enroll biometric"
                      >
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                        </svg>
                        Enroll
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      {showEnrollModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Enroll Biometric</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedEmployee.BADGENUMBER} - {selectedEmployee.NAME}
                </p>
              </div>
              <button
                onClick={handleCloseEnrollModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isEnrolling}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Employee Info */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="font-medium text-blue-900">Department:</span> <span className="text-blue-800">{selectedEmployee.DEPTNAME || 'N/A'}</span></div>
                  <div><span className="font-medium text-blue-900">Enrolled Fingers:</span> <span className="text-blue-800">{enrolledFingers.length}/10</span></div>
                  <div><span className="font-medium text-blue-900">Status:</span> 
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${enrolledFingers.length > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {enrolledFingers.length > 0 ? 'Has Bio Login' : 'No Bio Login'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Enrollment Interface */}
                <div>
                {/* DigitalPersona UI Support Enrollment */}
                <div className="max-w-2xl mx-auto">
                  <h4 className="font-semibold text-gray-800 mb-4 text-center">DigitalPersona Biometric Enrollment</h4>
                  
                  {/* Enrolled Fingers List */}
                  {enrolledFingers.length > 0 && (
                    <div className="mb-6 bg-white p-4 rounded-lg border-2 border-green-200">
                      <h5 className="text-sm font-semibold text-green-800 mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Enrolled Fingers ({enrolledFingers.length}/10)
                      </h5>
                      <div className="space-y-2">
                        {enrolledFingers.map((fingerId) => (
                          <div key={fingerId} className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="flex items-center">
                              <span className="text-sm font-medium text-green-800">
                                {fingerNames[fingerId]}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteFinger(fingerId)}
                              disabled={isEnrolling}
                              className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={`Delete ${fingerNames[fingerId]} enrollment`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-gray-500 text-center">
                        Click the delete icon to remove a finger enrollment
                      </p>
                    </div>
                  )}
                  
                  {/* Info Notice */}
                  {!isEnrolling && (
                    <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-800 mb-1">How it works:</p>
                          <p className="text-xs text-blue-700">
                            The DigitalPersona SDK will automatically detect which finger you place on the scanner. 
                            Simply place any finger on the device when the enrollment window appears, and the system will 
                            identify and enroll it for you.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Enrollment Action */}
                  <div className="bg-gray-50 p-6 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-center mb-6">
                      <svg className={`w-24 h-24 mx-auto mb-4 ${isEnrolling ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                      </svg>
                      <p className="text-sm text-gray-600">
                        {isEnrolling
                          ? 'Follow the instructions in the DigitalPersona enrollment window'
                          : 'Click the button below to start enrollment'}
                      </p>
                    </div>

                    {/* DPFP.Gui Enrollment Progress Indicator */}
                    {isEnrolling && (
                      <div className="mb-6 bg-blue-50 border-2 border-blue-400 p-6 rounded-lg">
                        <div className="text-center">
                          <div className="mb-4">
                            <div className="inline-block w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                              <span className="text-4xl">📱</span>
                            </div>
                          </div>
                          <p className="text-lg font-bold text-blue-800 mb-2">
                            DigitalPersona Enrollment Window Active
                          </p>
                          <p className="text-sm text-gray-700 mb-3">
                            A separate enrollment window has appeared. Please follow the on-screen instructions to complete fingerprint enrollment.
                          </p>
                          <div className="bg-white p-3 rounded border border-blue-200 mb-3">
                            <p className="text-xs text-gray-600 mb-1">
                              <strong>Instructions:</strong>
                            </p>
                            <ul className="text-xs text-left text-gray-600 space-y-1">
                              <li>• Place your finger on the scanner when prompted</li>
                              <li>• Follow the visual feedback in the enrollment window</li>
                              <li>• The SDK will guide you through multiple samples</li>
                              <li>• Keep the window in focus until completion</li>
                            </ul>
                          </div>
                          <p className="text-xs text-gray-500 italic">{captureProgress}</p>
                        </div>
                      </div>
                    )}

                    {/* Enrollment Button or Cancel Button */}
                    {isEnrolling ? (
                      <div className="space-y-3">
                        <button
                          onClick={handleEnrollFinger}
                          disabled={true}
                          className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-gray-400 cursor-not-allowed"
                        >
                          <div className="flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                            Enrolling...
                          </div>
                        </button>
                        
                        <button
                          onClick={handleStopEnrollment}
                          className="w-full py-3 px-6 rounded-lg font-medium text-red-600 bg-red-50 hover:bg-red-100 border-2 border-red-200 transition-all"
                        >
                          <div className="flex items-center justify-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Cancel Enrollment
                          </div>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleEnrollFinger}
                        disabled={!readerAvailable}
                        className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all ${
                          !readerAvailable
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105'
                        }`}
                      >
                        <div className="flex items-center justify-center">
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                          </svg>
                          Start Enrollment
                        </div>
                      </button>
                    )}

                    {/* Status Messages */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                      <p className="text-sm font-medium text-gray-700">{enrollmentStatus}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Confirmation Modal */}
              {showSaveConfirmation && capturedTemplate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6">
                    <div className="text-center mb-6">
                      <div className="text-6xl mb-4">✅</div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Fingerprint Captured Successfully!</h3>
                      <p className="text-gray-600">All 3 samples have been captured. Review and confirm to save.</p>
                    </div>
                    
                    {/* Capture Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h4 className="font-semibold text-gray-900 mb-3">Capture Summary</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Employee:</span>
                          <span className="ml-2 font-medium">{selectedEmployee?.NAME}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Finger:</span>
                          <span className="ml-2 font-medium">{fingerNames[selectedFinger]}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Badge Number:</span>
                          <span className="ml-2 font-medium">{selectedEmployee?.BADGENUMBER}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Samples Captured:</span>
                          <span className="ml-2 font-medium text-green-600">{capturedTemplate?.samplesCollected || 3}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Template Size:</span>
                          <span className="ml-2 font-medium">{capturedTemplate?.templateSize || 0} bytes</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Quality:</span>
                          <span className="ml-2 font-medium text-green-600">{capturedTemplate?.avgQuality || 95}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                      <button
                        onClick={handleCancelEnrollment}
                        className="flex-1 py-3 px-6 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSaveEnrollment}
                        className="flex-1 py-3 px-6 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl transition-all"
                      >
                        Save Enrollment
                      </button>
                    </div>
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

export default EnrollEmployeeBio;
