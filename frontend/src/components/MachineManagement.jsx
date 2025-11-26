import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

const MachineManagement = () => {
  const [machines, setMachines] = useState([]);
  const [machineStatuses, setMachineStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [machineLogs, setMachineLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [progress, setProgress] = useState({
    currentStep: '',
    totalSteps: 0,
    currentStepNumber: 0,
    percentage: 0,
    message: '',
    details: '',
    logsProcessed: 0,
    totalLogs: 0,
    errors: []
  });
  const [syncResult, setSyncResult] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Add state for device info
  const [deviceInfo, setDeviceInfo] = useState({});

  // Add separate states for Preview Logs
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewProgress, setPreviewProgress] = useState({
    currentStep: '',
    percentage: 0,
    message: '',
    details: '',
    logsFound: 0,
    logsProcessed: 0,
    logsSaved: 0,
    errors: []
  });
  const [previewResult, setPreviewResult] = useState(null);

  // Add separate states for Fetch All Logs
  const [showFetchAllModal, setShowFetchAllModal] = useState(false);
  const [fetchAllProgress, setFetchAllProgress] = useState({
    currentStep: '',
    percentage: 0,
    message: '',
    details: '',
    totalMachines: 0,
    processedMachines: 0,
    currentMachine: '',
    machineResults: [],
    errors: [],
    currentMachineProgress: 0,
    currentMachineStep: '',
    currentMachineDetails: '',
    logsFound: 0,
    logsProcessed: 0,
    logsSaved: 0
  });
  const [fetchAllResult, setFetchAllResult] = useState(null);

  // Add state for machine registration
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    id: '',
    name: '',
    connectionType: 1,
    ipAddress: '',
    serialPort: 1,
    port: 4370,
    baudrate: 115200,
    commPassword: 0,
    machine: ''
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Add state for machine editing
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    connectionType: 1,
    ipAddress: '',
    serialPort: 1,
    port: 4370,
    baudrate: 115200,
    commPassword: 0,
    machine: ''
  });
  const [editTestingConnection, setEditTestingConnection] = useState(false);
  const [editConnectionTestResult, setEditConnectionTestResult] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Ref to store the interval ID
  const pingIntervalRef = useRef(null);

  // Add state for sync time
  const [syncingTime, setSyncingTime] = useState(false);

  // Fetch device information for all machines
  const fetchDeviceInfo = async () => {
    try {
      console.log('Fetching device info...');
      const response = await api.get('/machines/device-info', {
        timeout: 60000 // Increase timeout to 60 seconds
      });
      console.log('Device info response:', response.data);
      
      if (response.data.success) {
        const infoMap = {};
        response.data.data.forEach(device => {
          infoMap[device.machineId] = device;
        });
        setDeviceInfo(infoMap);
        console.log('Device info map:', infoMap);
      }
    } catch (error) {
      console.error('Error fetching device info:', error);
    }
  };

  // Fetch device info on component mount and periodically
  useEffect(() => {
    fetchDeviceInfo();
    const interval = setInterval(fetchDeviceInfo, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchMachines();
    startPingInterval();
    
    // Cleanup interval on component unmount
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const response = await api.get('/machines');
      if (response.data.success) {
        setMachines(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching machines:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMachineStatuses = async () => {
    try {
      const response = await api.get('/machines/status/all');
      if (response.data.success) {
        const statusMap = {};
        response.data.data.forEach(status => {
          statusMap[status.id] = status;
        });
        setMachineStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error fetching machine statuses:', error);
    }
  };

  const startPingInterval = () => {
    // Initial ping
    fetchMachineStatuses();
    
    // Set up interval to ping every 30 seconds
    pingIntervalRef.current = setInterval(() => {
      fetchMachineStatuses();
    }, 30000); // Changed from 5000 to 30000 (30 seconds)
  };

  const getMachineStatus = (machineId) => {
    const status = machineStatuses[machineId];
    if (!status) {
      return { status: 'checking', pingTime: null, errorMessage: null };
    }
    return status;
  };

  const getStatusDisplay = (machine) => {
    const status = getMachineStatus(machine.ID);
    
    if (status.status === 'checking') {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Checking...
        </span>
      );
    }
    
    if (status.status === 'online') {
      return (
        <div className="flex items-center space-x-2">
          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
            Online
          </span>
          {status.pingTime && (
            <span className="text-xs text-gray-500">
              {status.pingTime}ms
            </span>
          )}
        </div>
      );
    }
    
    // Offline status (including high latency)
    return (
      <div className="flex items-center space-x-2">
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Offline
        </span>
        {status.pingTime && status.pingTime > 1000 && (
          <span className="text-xs text-red-500" title={`High latency: ${status.pingTime}ms`}>
            {status.pingTime}ms
          </span>
        )}
        {status.errorMessage && (
          <span className="text-xs text-red-500" title={status.errorMessage}>
            Error
          </span>
        )}
      </div>
    );
  };

  // Preview logs from machine (view only, no database save)
  const handlePreviewLogs = async (machineId) => {
    try {
      console.log('Starting preview logs for machine:', machineId);
      
      setLogsLoading(true);
      setShowPreviewModal(true);
      setPreviewProgress({
        currentStep: 'Starting',
        percentage: 0,
        message: 'Initializing preview process...',
        details: '',
        logsFound: 0,
        logsProcessed: 0,
        logsSaved: 0,
        errors: []
      });
      setPreviewResult(null);

      // Use Server-Sent Events for real-time progress updates
      const eventSource = new EventSource(`/api/machines/${machineId}/manual-fetch?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      
      // Store reference for potential cancellation
      window.currentEventSource = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened for preview logs');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[FRONTEND] Received SSE data for preview:', data);
          
          if (data.type === 'connected') {
            console.log('Connected to preview logs process');
            return;
          }

          if (data.type === 'complete') {
            console.log('[FRONTEND] Preview complete event received:', data);
            console.log('[FRONTEND] Full data object:', JSON.stringify(data, null, 2));
            console.log('[FRONTEND] Data.data:', data.data);
            console.log('[FRONTEND] New logs count:', data.data?.newLogs);
            console.log('[FRONTEND] Logs array length:', data.data?.logs?.length);
            console.log('[FRONTEND] Duplicates count:', data.data?.duplicates);
            console.log('[FRONTEND] Skipped count:', data.data?.skipped);
            console.log('[FRONTEND] Unregistered employees:', data.data?.unregisteredEmployees);
            
            setPreviewResult(data);
            // Set only the new logs (not yet in database) to display in the grid
            if (data.data && data.data.logs) {
              setMachineLogs(data.data.logs);
              console.log('Preview logs set:', data.data.logs);
            }
            setPreviewProgress(prev => ({
              ...prev,
              currentStep: 'Completed',
              message: data.message,
              percentage: 100,
              errors: []
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'error') {
            console.error('[FRONTEND] Preview error event received:', data);
            setPreviewResult({ success: false, message: data.message });
            setPreviewProgress(prev => ({
              ...prev,
              currentStep: 'Error',
              message: data.message,
              percentage: 100,
              errors: [data.message]
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'progress') {
            console.log('[FRONTEND] Progress event received:', data);
            setPreviewProgress(prev => ({
              ...prev,
              ...data,
              errors: data.errors || prev.errors || []
            }));
            return;
          }

          if (data.error) {
            throw new Error(data.error);
          }

          // Regular progress update - preserve existing errors array
          console.log('[FRONTEND] Regular update received:', data);
          setPreviewProgress(prev => ({
            ...prev,
            ...data,
            errors: data.errors || prev.errors || []
          }));
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error for preview logs:', error);
        setPreviewProgress(prev => ({
          ...prev,
          errors: [...prev.errors, 'Connection error occurred']
        }));
        eventSource.close();
      };

    } catch (error) {
      console.error('Error previewing logs:', error);
      setPreviewResult({ success: false, message: error.message });
      setPreviewProgress(prev => ({ ...prev, message: 'Preview failed!' }));
    }
  };

  // Fetch logs and save to database
  const handleFetchLogs = async (machineId) => {
    try {
      console.log('Starting fetch logs for machine:', machineId);
      
      setLogsLoading(true);
      setShowProgressModal(true);
      setProgress({
        currentStep: 'Starting',
        totalSteps: 0,
        currentStepNumber: 0,
        percentage: 0,
        message: 'Initializing fetch process...',
        details: '',
        logsProcessed: 0,
        totalLogs: 0,
        errors: []
      });
      setSyncResult(null);

      // Use Server-Sent Events for real-time progress updates
      const eventSource = new EventSource(`/api/machines/${machineId}/sync-sse?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&saveToDatabase=true`);
      
      // Store reference for potential cancellation
      window.currentEventSource = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened for fetch logs');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[FRONTEND] Received SSE data for fetch:', data);
          
          if (data.type === 'connected') {
            console.log('Connected to fetch logs process');
            return;
          }

          if (data.type === 'complete') {
            console.log('[FRONTEND] Fetch complete event received:', data);
            setSyncResult(data);
            // Set only the newly inserted logs to display in the grid
            if (data.data && data.data.logs) {
              setMachineLogs(data.data.logs);
            }
            setProgress(prev => ({
              ...prev,
              currentStep: 'Completed',
              message: data.message,
              percentage: 100,
              errors: [] // Clear all errors after completion
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'error') {
            console.log('[FRONTEND] Fetch error event received:', data);
            setSyncResult({ success: false, message: data.message });
            setProgress(prev => ({
              ...prev,
              errors: [...(prev.errors || []), data.message]
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'progress') {
            console.log('[FRONTEND] Fetch progress event received:', data);
            setProgress(prev => ({
              ...prev,
              ...data,
              errors: data.errors || prev.errors || []
            }));
            return;
          }

          if (data.error) {
            throw new Error(data.error);
          }

          // Regular progress update - preserve existing errors array
          console.log('[FRONTEND] Fetch regular update received:', data);
          setProgress(prev => ({
            ...prev,
            ...data,
            errors: data.errors || prev.errors || []
          }));
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error for fetch logs:', error);
        setProgress(prev => ({
          ...prev,
          errors: [...(prev.errors || []), 'Connection error occurred']
        }));
        setLogsLoading(false);
        eventSource.close();
        window.currentEventSource = null;
      };

    } catch (error) {
      console.error('Error fetching logs:', error);
      setSyncResult({ success: false, message: error.message });
      setProgress(prev => ({ ...prev, message: 'Fetch failed!' }));
      setLogsLoading(false);
    }
  };

  // Fetch logs from all online machines
  const handleFetchAllLogs = async () => {
    try {
      setLogsLoading(true);
      setShowFetchAllModal(true);
      setFetchAllProgress({
        currentStep: 'Initializing',
        percentage: 0,
        message: 'Starting bulk fetch process...',
        details: 'Preparing to fetch logs from all online machines',
        totalMachines: 0,
        processedMachines: 0,
        currentMachine: '',
        machineResults: [],
        errors: [],
        currentMachineProgress: 0,
        currentMachineStep: '',
        currentMachineDetails: '',
        logsFound: 0,
        logsProcessed: 0,
        logsSaved: 0
      });
      setFetchAllResult(null);

      // Use Server-Sent Events for real-time progress updates
      const eventSource = new EventSource(`/api/machines/sync-all-sse?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&saveToDatabase=true`);
      
      // Store reference for potential cancellation
      window.currentEventSource = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened for fetch all logs');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[FRONTEND] Received SSE data for fetch all:', data);
          
          if (data.type === 'connected') {
            console.log('Connected to fetch all logs process');
            return;
          }

          if (data.type === 'complete') {
            console.log('[FRONTEND] Fetch all complete event received:', data);
            setFetchAllResult(data);
            setFetchAllProgress(prev => ({
              ...prev,
              currentStep: 'Completed',
              message: data.message,
              percentage: 100,
              errors: []
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'error') {
            console.log('[FRONTEND] Fetch all error event received:', data);
            setFetchAllResult({ success: false, message: data.message });
            setFetchAllProgress(prev => ({
              ...prev,
              currentStep: 'Error',
              message: data.message,
              percentage: 100,
              errors: [data.message]
            }));
            setLogsLoading(false);
            eventSource.close();
            window.currentEventSource = null;
            return;
          }

          if (data.type === 'progress') {
            console.log('[FRONTEND] Fetch all progress event received:', data);
            console.log('[FRONTEND] logsFound:', data.logsFound);
            console.log('[FRONTEND] logsProcessed:', data.logsProcessed);
            console.log('[FRONTEND] currentMachine:', data.currentMachine);
            setFetchAllProgress(prev => ({
              ...prev,
              ...data,
              errors: data.errors || prev.errors || []
            }));
            return;
          }

          if (data.error) {
            throw new Error(data.error);
          }

          // Regular progress update - preserve existing errors array
          console.log('[FRONTEND] Fetch all regular update received:', data);
          setFetchAllProgress(prev => ({
            ...prev,
            ...data,
            errors: data.errors || prev.errors || []
          }));
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error for fetch all logs:', error);
        setFetchAllProgress(prev => ({
          ...prev,
          errors: [...(prev.errors || []), 'Connection error occurred']
        }));
        setLogsLoading(false);
        eventSource.close();
        window.currentEventSource = null;
      };

    } catch (error) {
      console.error('Error fetching all logs:', error);
      setFetchAllResult({ success: false, message: error.message });
      setFetchAllProgress(prev => ({ ...prev, message: 'Fetch all failed!' }));
      setLogsLoading(false);
    }
  };

  // Test machine connection
  const testConnection = async () => {
    if (!registerForm.ipAddress || !registerForm.port) {
      setConnectionTestResult({
        success: false,
        message: 'Please enter IP address and port'
      });
      return;
    }

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const response = await api.post('/machines/test-connection', {
        ipAddress: registerForm.ipAddress,
        port: registerForm.port,
        password: registerForm.password
      });

      setConnectionTestResult({
        success: response.data.success,
        message: response.data.message,
        pingTime: response.data.pingTime
      });
    } catch (error) {
      setConnectionTestResult({
        success: false,
        message: error.response?.data?.message || 'Connection test failed'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Register new machine
  const registerMachine = async () => {
    if (!registerForm.name || !registerForm.ipAddress || !registerForm.id || !registerForm.machine) {
      alert('Please fill in all required fields');
      return;
    }

    if (registerForm.machine.length !== 3) {
      alert('Machine number must be exactly 3 digits');
      return;
    }

    setRegisterLoading(true);
    try {
      const response = await api.post('/machines', registerForm);
      
      if (response.data.success) {
        alert('Machine registered successfully!');
        setShowRegisterModal(false);
        setRegisterForm({
          id: '',
          name: '',
          connectionType: 1,
          ipAddress: '',
          serialPort: 1,
          port: 4370,
          baudrate: 115200,
          commPassword: 0,
          machine: ''
        });
        setConnectionTestResult(null);
        fetchMachines(); // Refresh the machines list
      } else {
        alert('Failed to register machine: ' + response.data.message);
      }
    } catch (error) {
      if (error.response?.data?.conflicts) {
        const conflicts = error.response.data.conflicts;
        alert(`Registration failed: The following fields already exist: ${conflicts.join(', ')}. Please use different values.`);
      } else {
        alert('Error registering machine: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  // Edit machine function
  const editMachine = async () => {
    if (!editForm.name || !editForm.ipAddress || !editForm.id || !editForm.machine) {
      alert('Please fill in all required fields');
      return;
    }

    if (editForm.machine.length !== 3) {
      alert('Machine number must be exactly 3 digits');
      return;
    }

    setEditLoading(true);
    try {
      const response = await api.put(`/machines/${editingMachine.ID}`, editForm);
      
      if (response.data.success) {
        alert('Machine updated successfully!');
        setShowEditModal(false);
        setEditingMachine(null);
        setEditForm({
          id: '',
          name: '',
          connectionType: 1,
          ipAddress: '',
          serialPort: 1,
          port: 4370,
          baudrate: 115200,
          commPassword: 0,
          machine: ''
        });
        setEditConnectionTestResult(null);
        fetchMachines(); // Refresh the machines list
      } else {
        alert('Failed to update machine: ' + response.data.message);
      }
    } catch (error) {
      alert('Error updating machine: ' + (error.response?.data?.message || error.message));
    } finally {
      setEditLoading(false);
    }
  };

  // Test connection for edit
  const testEditConnection = async () => {
    if (!editForm.ipAddress || !editForm.port) {
      setEditConnectionTestResult({
        success: false,
        message: 'Please enter IP address and port'
      });
      return;
    }

    setEditTestingConnection(true);
    setEditConnectionTestResult(null);

    try {
      const response = await api.post('/machines/test-connection', {
        ipAddress: editForm.ipAddress,
        port: editForm.port,
        password: editForm.commPassword
      });

      setEditConnectionTestResult({
        success: response.data.success,
        message: response.data.message,
        pingTime: response.data.pingTime
      });
    } catch (error) {
      setEditConnectionTestResult({
        success: false,
        message: error.response?.data?.message || 'Connection test failed'
      });
    } finally {
      setEditTestingConnection(false);
    }
  };

  // Handle edit machine button click
  const handleEditMachine = (machine) => {
    setEditingMachine(machine);
    setEditForm({
      id: machine.ID.toString(),
      name: machine.MachineAlias,
      connectionType: machine.ConnectType,
      ipAddress: machine.IP,
      serialPort: machine.SerialPort,
      port: machine.Port,
      baudrate: machine.Baudrate,
      commPassword: machine.CommPassword,
      machine: machine.MachineNumber.toString().padStart(3, '0')
    });
    setEditConnectionTestResult(null);
    setShowEditModal(true);
  };

  // Sync time function
  const handleSyncTime = async (machineId) => {
    try {
      setSyncingTime(true);
      
      const response = await api.post(`/machines/${machineId}/sync-time`);
      
      if (response.data.success) {
        alert(`Time synchronized successfully for ${response.data.machineName}!`);
      } else {
        alert('Failed to sync time: ' + response.data.message);
      }
    } catch (error) {
      alert('Error syncing time: ' + (error.response?.data?.message || error.message));
    } finally {
      setSyncingTime(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Biometric Machine Management</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowRegisterModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Register Machine</span>
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Real-time monitoring active</span>
          </div>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Date Range</h3>
          <button
            onClick={handleFetchAllLogs}
            disabled={logsLoading}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            title="Fetch logs from all online machines"
          >
            {logsLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>Fetching All...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Fetch All Logs</span>
              </>
            )}
          </button>
        </div>
        <div className="flex space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
              className="mt-1 block border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
              className="mt-1 block border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Machines Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Machine Alias
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Port
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Face Print
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Finger Print
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Log Count
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
            {machines.map((machine) => (
              <tr key={machine.ID}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {machine.MachineAlias}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {machine.IP}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {machine.Port}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {deviceInfo[machine.ID]?.faceCount || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {deviceInfo[machine.ID]?.fingerprintCount || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    {deviceInfo[machine.ID]?.logCount || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusDisplay(machine)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    {/* Edit Machine Button */}
                    <button
                      onClick={() => handleEditMachine(machine)}
                      className="bg-yellow-600 text-white p-2 rounded-lg hover:bg-yellow-700 transition-colors"
                      title="Edit machine information"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    
                    {/* Sync Time Button */}
                    <button
                      onClick={() => handleSyncTime(machine.ID)}
                      disabled={syncingTime || getMachineStatus(machine.ID).status !== 'online'}
                      className="bg-orange-600 text-white p-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Sync PC time to biometric machine"
                    >
                      {syncingTime ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Preview Logs Button */}
                    <button
                      onClick={() => handlePreviewLogs(machine.ID)}
                      disabled={logsLoading || getMachineStatus(machine.ID).status !== 'online'}
                      className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Preview logs from machine (read-only)"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    
                    {/* Fetch Logs Button */}
                    <button
                      onClick={() => handleFetchLogs(machine.ID)}
                      disabled={logsLoading || getMachineStatus(machine.ID).status !== 'online'}
                      className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Fetch logs and save to database"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Progress Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {syncResult ? 'Sync Complete' : 'Syncing Logs'}
              </h2>
              <button
                onClick={() => {
                  setShowProgressModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Content */}
            {!syncResult ? (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{progress.currentStep}</span>
                    <span className="text-sm text-gray-500">
                      {progress.logsFound > 0 ? 
                        `${progress.logsProcessed}/${progress.logsFound}` : 
                        'Processing...'
                      }
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: progress.logsFound > 0 ? 
                          `${Math.min((progress.logsProcessed / progress.logsFound) * 100, 100)}%` :
                          '0%'
                      }}
                    ></div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">{progress.message}</p>
                    {progress.details && (
                      <p className="text-xs text-gray-500 mt-1">{progress.details}</p>
                    )}
                  </div>
                </div>

                {/* Log Statistics */}
                {progress.logsFound > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Logs:</span>
                        <span className="font-medium">{progress.logsFound}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Processed:</span>
                        <span className="font-medium">{progress.logsProcessed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Saved:</span>
                        <span className="font-medium text-green-600">{progress.logsSaved || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Progress:</span>
                        <span className="font-medium">
                          {Math.round((progress.logsProcessed / progress.logsFound) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Results */
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${syncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${syncResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                      {syncResult.success ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className={`font-medium ${syncResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {syncResult.success ? 'Sync Completed Successfully' : 'Sync Failed'}
                      </h3>
                      <p className="text-sm text-gray-600">{syncResult.message}</p>
                    </div>
                  </div>
                  
                  {syncResult.success && syncResult.data && (
                    <div className="mt-4 space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Logs:</span>
                          <span className="font-medium">{syncResult.data.totalLogs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">New Logs:</span>
                          <span className="font-medium text-green-600">{syncResult.data.saved}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Duplicates:</span>
                          <span className="font-medium text-orange-600">{syncResult.data.duplicates}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Processed:</span>
                          <span className="font-medium">{syncResult.data.processed}</span>
                        </div>
                      </div>
                      
                      {syncResult.data.saved > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => setShowLogsModal(true)}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>View Saved Logs ({syncResult.data.saved})</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowProgressModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  syncResult ? 
                    'bg-gray-600 text-white hover:bg-gray-700' : 
                    'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {syncResult ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Logs Progress Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {previewResult ? 'Preview Complete' : 'Previewing Logs'}
              </h2>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Progress Content */}
            {!previewResult ? (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{previewProgress.currentStep}</span>
                    <span className="text-sm text-gray-500">
                      {previewProgress.logsFound > 0 ? 
                        `${previewProgress.logsProcessed}/${previewProgress.logsFound}` : 
                        'Processing...'
                      }
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: previewProgress.logsFound > 0 ? 
                          `${Math.min((previewProgress.logsProcessed / previewProgress.logsFound) * 100, 100)}%` :
                          '0%'
                      }}
                    ></div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">{previewProgress.message}</p>
                    {previewProgress.details && (
                      <p className="text-xs text-gray-500 mt-1">{previewProgress.details}</p>
                    )}
                  </div>
                </div>

                {/* Log Statistics */}
                {previewProgress.logsFound > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Logs:</span>
                        <span className="font-medium">{previewProgress.logsFound}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Processed:</span>
                        <span className="font-medium">{previewProgress.logsProcessed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Logs:</span>
                        <span className="font-medium text-green-600">{previewProgress.logsSaved || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Progress:</span>
                        <span className="font-medium">
                          {Math.round((previewProgress.logsProcessed / previewProgress.logsFound) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Preview Results */
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${previewResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${previewResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                      {previewResult.success ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className={`font-medium ${previewResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {previewResult.success ? 'Preview Completed' : 'Preview Failed'}
                      </h3>
                      <p className="text-sm text-gray-600">{previewResult.message}</p>
                    </div>
                  </div>
                  
                  {previewResult.success && previewResult.data && (
                    <div className="mt-4 space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Logs:</span>
                          <span className="font-medium">{previewResult.data.totalLogs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">New Logs:</span>
                          <span className="font-medium text-green-600">{previewResult.data.newLogs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Duplicates:</span>
                          <span className="font-medium text-orange-600">{previewResult.data.duplicates}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Skipped:</span>
                          <span className="font-medium text-gray-600">{previewResult.data.skipped}</span>
                        </div>
                      </div>
                      
                      {previewResult.data.newLogs > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => setShowLogsModal(true)}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>View New Logs ({previewResult.data.newLogs})</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  previewResult ? 
                    'bg-gray-600 text-white hover:bg-gray-700' : 
                    'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {previewResult ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fetch All Logs Progress Modal */}
      {showFetchAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {fetchAllResult ? 'Fetch All Complete' : 'Fetching All Logs'}
              </h2>
              <button
                onClick={() => {
                  setShowFetchAllModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Fetch All Progress Content */}
            {!fetchAllResult ? (
              <div className="space-y-6">
                {/* Overall Progress */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{fetchAllProgress.currentStep}</span>
                    <span className="text-sm text-gray-500">
                      {fetchAllProgress.totalMachines > 0 ? 
                        `${fetchAllProgress.processedMachines || 0}/${fetchAllProgress.totalMachines} machines` : 
                        'Initializing...'
                      }
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${Math.min(fetchAllProgress.percentage || 0, 100)}%`
                      }}
                    ></div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">{fetchAllProgress.message}</p>
                    {fetchAllProgress.details && (
                      <p className="text-xs text-gray-500 mt-1">{fetchAllProgress.details}</p>
                    )}
                    
                    {/* Sub-progress bar for current machine log reading - similar to individual fetch logs */}
                    {fetchAllProgress.currentMachine && fetchAllProgress.logsFound > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded border">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-blue-700 font-medium">
                            {fetchAllProgress.currentMachine}
                          </span>
                          <span className="text-xs text-blue-600">
                            {fetchAllProgress.logsProcessed || 0}/{fetchAllProgress.logsFound || 0}
                          </span>
                        </div>
                        
                        {/* Sub-progress bar for current machine - exactly like individual fetch logs */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                            style={{ 
                              width: fetchAllProgress.logsFound > 0 ? 
                                `${Math.min((fetchAllProgress.logsProcessed / fetchAllProgress.logsFound) * 100, 100)}%` :
                                '0%'
                            }}
                          ></div>
                        </div>
                        
                        <div className="mt-2">
                          <p className="text-xs text-gray-600">{fetchAllProgress.currentMachineStep || 'Processing logs...'}</p>
                          {fetchAllProgress.currentMachineDetails && (
                            <p className="text-xs text-gray-500 mt-1">{fetchAllProgress.currentMachineDetails}</p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Current Machine Info (without sub-progress bar) - for when no logs are being processed yet */}
                    {fetchAllProgress.currentMachine && (!fetchAllProgress.logsFound || fetchAllProgress.logsFound === 0) && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-blue-700 font-medium">
                            Current: {fetchAllProgress.currentMachine}
                          </span>
                          <span className="text-xs text-blue-600">
                            {fetchAllProgress.currentMachineProgress || 0}%
                          </span>
                        </div>
                        <div className="mt-1">
                          <div className="text-xs text-blue-600">
                            {fetchAllProgress.currentMachineStep || ''}
                          </div>
                          {fetchAllProgress.currentMachineDetails && (
                            <div className="text-xs text-gray-500 mt-1">
                              {fetchAllProgress.currentMachineDetails}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Machine Results */}
                {fetchAllProgress.machineResults && fetchAllProgress.machineResults.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Machine Results:</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {fetchAllProgress.machineResults.map((result, index) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                          result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{result.machineAlias}</span>
                            <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                              {result.success ? '✓' : '✗'}
                            </span>
                          </div>
                          {result.success ? (
                            <div className="text-xs text-gray-600 mt-1">
                              {result.totalLogs || 0} logs found, {result.saved || 0} new logs, {result.duplicates || 0} duplicates
                            </div>
                          ) : (
                            <div className="text-xs text-red-600 mt-1">
                              {result.error || 'Failed to process'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Fetch All Results */
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${fetchAllResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${fetchAllResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                      {fetchAllResult.success ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className={`font-medium ${fetchAllResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {fetchAllResult.success ? 'Fetch All Completed' : 'Fetch All Failed'}
                      </h3>
                      <p className="text-sm text-gray-600">{fetchAllResult.message}</p>
                    </div>
                  </div>
                  
                  {fetchAllResult.success && fetchAllResult.data && (
                    <div className="mt-4 space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Machines:</span>
                          <span className="font-medium">{fetchAllResult.data.totalMachines}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Online Machines:</span>
                          <span className="font-medium text-green-600">{fetchAllResult.data.onlineMachines}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Logs Found:</span>
                          <span className="font-medium">{fetchAllResult.data.totalLogs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">New Logs Saved:</span>
                          <span className="font-medium text-green-600">{fetchAllResult.data.totalSaved}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Duplicates:</span>
                          <span className="font-medium text-orange-600">{fetchAllResult.data.totalDuplicates}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Offline Machines:</span>
                          <span className="font-medium text-red-600">{fetchAllResult.data.offlineMachines}</span>
                        </div>
                      </div>
                      
                      {/* Machine-wise breakdown */}
                      {fetchAllResult.data.results && fetchAllResult.data.results.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Machine Results:</h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {fetchAllResult.data.results.map((result, index) => (
                              <div key={index} className={`p-2 rounded text-xs ${
                                result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{result.machineAlias}</span>
                                  <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                                    {result.success ? '✓' : '✗'}
                                  </span>
                                </div>
                                {result.success ? (
                                  <div className="text-xs text-gray-600 mt-1">
                                    {result.totalLogs || 0} logs found, {result.saved || 0} new logs, {result.duplicates || 0} duplicates
                                  </div>
                                ) : (
                                  <div className="text-xs text-red-600 mt-1">
                                    {result.error || 'Failed to process'}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowFetchAllModal(false);
                  setLogsLoading(false);
                  if (window.currentEventSource) {
                    window.currentEventSource.close();
                    window.currentEventSource = null;
                  }
                }}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  fetchAllResult ? 
                    'bg-gray-600 text-white hover:bg-gray-700' : 
                    'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {fetchAllResult ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal - Updated to show preview logs */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                New Logs from Machine
              </h2>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4 text-sm text-gray-600">
              Date Range: {dateRange.startDate} to {dateRange.endDate} | 
              New Logs: {machineLogs.length} (logs not yet in database)
            </div>
            
            <div className="overflow-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Badge Number</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {machineLogs.map((log, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 text-sm text-gray-900">{log.userId || log.employeeId || log.deviceUserId}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{log.badgeNumber || log.deviceUserId}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {log.userName || log.name || 'Unknown Employee'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{log.deviceName || log.machineAlias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Machine Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Register New Machine</h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); registerMachine(); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID *
                  </label>
                  <input
                    type="text"
                    value={registerForm.id}
                    onChange={(e) => setRegisterForm({...registerForm, id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter machine ID"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machine Name *
                  </label>
                  <input
                    type="text"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Main Office Biometric"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connection Type
                  </label>
                  <select
                    value={registerForm.connectionType}
                    onChange={(e) => setRegisterForm({...registerForm, connectionType: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>TCP/IP</option>
                    <option value={2}>Serial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IP Address *
                  </label>
                  <input
                    type="text"
                    value={registerForm.ipAddress}
                    onChange={(e) => setRegisterForm({...registerForm, ipAddress: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="192.168.1.100"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serial Port
                    </label>
                    <input
                      type="number"
                      value={registerForm.serialPort}
                      onChange={(e) => setRegisterForm({...registerForm, serialPort: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={registerForm.port}
                      onChange={(e) => setRegisterForm({...registerForm, port: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="4370"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baudrate
                    </label>
                    <input
                      type="number"
                      value={registerForm.baudrate}
                      onChange={(e) => setRegisterForm({...registerForm, baudrate: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="115200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comm Password
                    </label>
                    <input
                      type="number"
                      value={registerForm.commPassword}
                      onChange={(e) => setRegisterForm({...registerForm, commPassword: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machine (3 digits) *
                  </label>
                  <input
                    type="number"
                    value={registerForm.machine}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Enforce 3 digit number
                      if (value === '' || (value.length <= 3 && /^\d+$/.test(value))) {
                        setRegisterForm({...registerForm, machine: value});
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="001"
                    maxLength={3}
                    required
                  />
                  {registerForm.machine && registerForm.machine.length !== 3 && (
                    <p className="text-red-500 text-xs mt-1">Machine number must be exactly 3 digits</p>
                  )}
                </div>

                {/* Connection Test Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Test Connection
                    </label>
                    <button
                      type="button"
                      onClick={testConnection}
                      disabled={testingConnection || !registerForm.ipAddress}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                    >
                      {testingConnection ? (
                        <>
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Test</span>
                        </>
                      )}
                    </button>
                  </div>

                  {connectionTestResult && (
                    <div className={`p-3 rounded-md text-sm ${
                      connectionTestResult.success 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      <div className="flex items-center space-x-2">
                        {connectionTestResult.success ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span>{connectionTestResult.message}</span>
                        {connectionTestResult.pingTime && (
                          <span className="text-xs">({connectionTestResult.pingTime}ms)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    registerLoading || 
                    !connectionTestResult || 
                    !connectionTestResult.success || 
                    (registerForm.machine && registerForm.machine.length !== 3)
                  }
                  className={`px-4 py-2 ${
                    registerLoading || 
                    !connectionTestResult || 
                    !connectionTestResult.success || 
                    (registerForm.machine && registerForm.machine.length !== 3)
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  } text-white rounded-md flex items-center space-x-2`}
                >
                  {registerLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span>Register Machine</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Machine Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Machine</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); editMachine(); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID *
                  </label>
                  <input
                    type="text"
                    value={editForm.id}
                    onChange={(e) => setEditForm({...editForm, id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter machine ID"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machine Name *
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Main Office Biometric"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connection Type
                  </label>
                  <select
                    value={editForm.connectionType}
                    onChange={(e) => setEditForm({...editForm, connectionType: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>TCP/IP</option>
                    <option value={2}>Serial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IP Address *
                  </label>
                  <input
                    type="text"
                    value={editForm.ipAddress}
                    onChange={(e) => setEditForm({...editForm, ipAddress: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="192.168.1.100"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serial Port
                    </label>
                    <input
                      type="number"
                      value={editForm.serialPort}
                      onChange={(e) => setEditForm({...editForm, serialPort: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={editForm.port}
                      onChange={(e) => setEditForm({...editForm, port: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="4370"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baudrate
                    </label>
                    <input
                      type="number"
                      value={editForm.baudrate}
                      onChange={(e) => setEditForm({...editForm, baudrate: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="115200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comm Password
                    </label>
                    <input
                      type="number"
                      value={editForm.commPassword}
                      onChange={(e) => setEditForm({...editForm, commPassword: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machine (3 digits) *
                  </label>
                  <input
                    type="number"
                    value={editForm.machine}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Enforce 3 digit number
                      if (value === '' || (value.length <= 3 && /^\d+$/.test(value))) {
                        setEditForm({...editForm, machine: value});
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="001"
                    maxLength={3}
                    required
                  />
                  {editForm.machine && editForm.machine.length !== 3 && (
                    <p className="text-red-500 text-xs mt-1">Machine number must be exactly 3 digits</p>
                  )}
                </div>

                {/* Connection Test Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Test Connection
                    </label>
                    <button
                      type="button"
                      onClick={testEditConnection}
                      disabled={editTestingConnection || !editForm.ipAddress}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                    >
                      {editTestingConnection ? (
                        <>
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Test</span>
                        </>
                      )}
                    </button>
                  </div>

                  {editConnectionTestResult && (
                    <div className={`p-3 rounded-md text-sm ${
                      editConnectionTestResult.success 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      <div className="flex items-center space-x-2">
                        {editConnectionTestResult.success ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span>{editConnectionTestResult.message}</span>
                        {editConnectionTestResult.pingTime && (
                          <span className="text-xs">({editConnectionTestResult.pingTime}ms)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    editLoading || 
                    !editConnectionTestResult || 
                    !editConnectionTestResult.success || 
                    (editForm.machine && editForm.machine.length !== 3)
                  }
                  className={`px-4 py-2 ${
                    editLoading || 
                    !editConnectionTestResult || 
                    !editConnectionTestResult.success || 
                    (editForm.machine && editForm.machine.length !== 3)
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-yellow-600 hover:bg-yellow-700'
                  } text-white rounded-md flex items-center space-x-2`}
                >
                  {editLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>Update Machine</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineManagement;