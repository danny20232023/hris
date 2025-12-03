import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../authContext';
import { useNavigate } from 'react-router-dom';
import MyShiftView from './MyShiftView';
import RawLogsView_Dtr from './RawLogsView_Dtr';
import PdsDtrChecker from './PdsDtrChecker';
import MyLeaveRecords from './MyLeaveRecords';
import MyLeaveTransactions from './myDTRChecker_201Leave';
import MyTravelPortal from './myDTRChecker_201Travels';
import PrintMyDTRChecker from './PrintMyDTRChecker';
import PrintMyDTRCheckerWithAnnotations from './PrintMyDTRCheckerWithAnnotations';
import PrintMyDTRRaw from './PrintMyDTRRaw';
import api from '../../utils/api';
import { getEmployeeShiftSchedule, extractTimeFromTimestamp } from '../../utils/shiftScheduleUtils';
import MyDtrCdoCredit from './myDTRCdoCredit';
import { openLocatorPrintWindow } from '../201/print_201EmployeeLocator';

// Utility to extract "HH:mm" from a string or Date
const getTimeOnly = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '';
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return '';
};

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// PDS Validation Helper Function
const validatePdsRequiredFields = (pdsData) => {
  if (!pdsData || !pdsData.employee) {
    return { valid: false, message: 'Please complete your Personal Data Sheet (PDS) to continue.' };
  }
  
  const employee = pdsData.employee;
  const requiredFields = {
    surname: 'Last Name',
    firstname: 'First Name',
    date_of_birth: 'Birth Date',
    sex: 'Gender',
    civil_status: 'Civil Status'
  };
  
  const missingFields = [];
  for (const [field, label] of Object.entries(requiredFields)) {
    if (!employee[field] || String(employee[field]).trim() === '') {
      missingFields.push(label);
    }
  }
  
  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Please fill in the following required fields in your PDS: ${missingFields.join(', ')}`
    };
  }
  
  return { valid: true, message: '' };
};

const DtrChecker = () => {
  const { user, loadingAuth, logout } = useAuth();
  const navigate = useNavigate();
  
  // Tab Navigation State with persistence
  const [activeTab, setActiveTab] = useState(() => {
    // Restore active tab from localStorage on component mount
    const savedTab = localStorage.getItem('dtrActiveTab');
    return savedTab || 'dtr-check';
  });
  
  // DTR Check Tab States with persistence
  const [selectedFilter, setSelectedFilter] = useState(() => {
    const savedFilter = localStorage.getItem('dtrSelectedFilter');
    return savedFilter || 'Today';
  });
  const [selectedView, setSelectedView] = useState(() => {
    const savedView = localStorage.getItem('dtrSelectedView');
    return savedView || 'My Shift';
  });
  const [selectedPeriod, setSelectedPeriod] = useState('full');
  const [filesSubTab, setFilesSubTab] = useState('leave-credits');
  const [myLocatorRows, setMyLocatorRows] = useState([]);
  const [myLocatorLoading, setMyLocatorLoading] = useState(false);
  const [currentDesignation, setCurrentDesignation] = useState(null);
  const [designationLoading, setDesignationLoading] = useState(false);
  const [shiftSchedule, setShiftSchedule] = useState(null);
  const [locatorData, setLocatorData] = useState([]);
  const [processedLogs, setProcessedLogs] = useState([]);
  const [rawLogs, setRawLogs] = useState([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showPrintOptionsModal, setShowPrintOptionsModal] = useState(false);
  const [printFormat, setPrintFormat] = useState('basic');
  const [selectedAnnotations, setSelectedAnnotations] = useState({
    locator: true,
    fixlog: true,
    leave: true,
    travel: true,
    cdo: true,
    holiday: true,
    weekend: true,
    absent: true
  });
  const timeoutRef = useRef();

  // SSN Change Modal States
  const [showSsnModal, setShowSsnModal] = useState(false);
  const [ssnForm, setSsnForm] = useState({
    currentSsn: '',
    newSsn: '',
    confirmSsn: ''
  });
  const [ssnError, setSsnError] = useState('');
  const [ssnSuccess, setSsnSuccess] = useState('');
  const [isChangingSsn, setIsChangingSsn] = useState(false);

  // User Dropdown Menu State
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // PDS Photo State
  const [pdsPhoto, setPdsPhoto] = useState(null);
  const [pdsPhotoLoading, setPdsPhotoLoading] = useState(false);

  // PDS Check State
  const [pdsCheckComplete, setPdsCheckComplete] = useState(false);
  const [checkingPds, setCheckingPds] = useState(true);
  const [pdsMessage, setPdsMessage] = useState('');

  // Admin Access State
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [adminUsername, setAdminUsername] = useState(null);
  const [checkingAdminAccess, setCheckingAdminAccess] = useState(false);

  // Fetch PDS photo for logged-in user
  useEffect(() => {
    const fetchPDSPhoto = async () => {
      if (!user || !(user.USERID || user.id)) {
        setPdsPhoto(null);
        return;
      }

      try {
        setPdsPhotoLoading(true);
        const response = await api.get('/pds-dtrchecker/me');
        
        console.log('🔍 [DtrChecker] PDS response:', response.data);
        
        if (response.data.success && response.data.data?.media?.photo) {
          console.log('✅ [DtrChecker] PDS photo found, using as avatar');
          console.log('🔍 [DtrChecker] PDS photo type:', typeof response.data.data.media.photo);
          console.log('🔍 [DtrChecker] PDS photo length:', response.data.data.media.photo?.length);
          setPdsPhoto(response.data.data.media.photo);
        } else {
          console.log('ℹ️ [DtrChecker] No PDS photo found, will use user.PHOTO');
          console.log('🔍 [DtrChecker] Response structure:', {
            success: response.data.success,
            hasData: !!response.data.data,
            hasMedia: !!response.data.data?.media,
            hasPhoto: !!response.data.data?.media?.photo
          });
          setPdsPhoto(null);
        }
      } catch (error) {
        // If 404, user doesn't have PDS yet - that's okay
        if (error?.response?.status === 404) {
          console.log('ℹ️ [DtrChecker] No PDS record found, will use user.PHOTO');
          setPdsPhoto(null);
        } else {
          console.error('❌ [DtrChecker] Error fetching PDS photo:', error);
          setPdsPhoto(null);
        }
      } finally {
        setPdsPhotoLoading(false);
      }
    };

    fetchPDSPhoto();
  }, [user]);

  // PDS Completion Check on Component Mount
  useEffect(() => {
    const checkPdsCompletion = async () => {
      if (!user || !(user.USERID || user.id) || loadingAuth) {
        setCheckingPds(false);
        return;
      }

      try {
        setCheckingPds(true);
        const response = await api.get('/pds-dtrchecker/me');
        
        if (response.data.success && response.data.data) {
          const validation = validatePdsRequiredFields(response.data.data);
          
          if (validation.valid) {
            setPdsCheckComplete(true);
            setPdsMessage('');
          } else {
            setPdsCheckComplete(false);
            setPdsMessage(validation.message);
            // Force user to My PDS tab if incomplete
            setActiveTab('my-pds');
          }
        } else {
          // No PDS data found
          setPdsCheckComplete(false);
          setPdsMessage('Please complete your Personal Data Sheet (PDS) to continue.');
          setActiveTab('my-pds');
        }
      } catch (error) {
        // If 404, user doesn't have PDS entry
        if (error?.response?.status === 404) {
          setPdsCheckComplete(false);
          setPdsMessage('Please complete your Personal Data Sheet (PDS) to continue.');
          setActiveTab('my-pds');
        } else {
          console.error('Error checking PDS completion:', error);
          // On error, allow access but log the error
          setPdsCheckComplete(true);
        }
      } finally {
        setCheckingPds(false);
      }
    };

    checkPdsCompletion();
  }, [user, loadingAuth]);

  // Check Admin Access - Check if portal user has active sysusers record with status = 1
  useEffect(() => {
    const checkAdminAccess = async () => {
      // Wait for auth to finish loading
      if (loadingAuth) {
        return;
      }

      if (!user || !(user.USERID || user.id)) {
        setHasAdminAccess(false);
        setAdminUsername(null);
        return;
      }

      // Check if token exists before making the request
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('No auth token found, skipping admin access check');
        setHasAdminAccess(false);
        setAdminUsername(null);
        return;
      }

      try {
        setCheckingAdminAccess(true);
        console.log('Checking admin access with token:', token ? 'Token present' : 'No token');
        // Ensure token is in the request headers
        const response = await api.get('/auth/check-admin-access', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        console.log('Admin access check response:', response.data);
        if (response.data.hasAdminAccess) {
          console.log('✅ Setting hasAdminAccess to TRUE, username:', response.data.username);
          setHasAdminAccess(true);
          setAdminUsername(response.data.username);
        } else {
          console.log('❌ Setting hasAdminAccess to FALSE');
          setHasAdminAccess(false);
          setAdminUsername(null);
        }
      } catch (error) {
        console.error('Error checking admin access:', error);
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
        console.error('Request config:', {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        });
        setHasAdminAccess(false);
        setAdminUsername(null);
      } finally {
        setCheckingAdminAccess(false);
      }
    };

    // Add a small delay to ensure auth is fully loaded
    const timeoutId = setTimeout(() => {
      checkAdminAccess();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [user, loadingAuth]);

  // Debug: Log when hasAdminAccess changes
  useEffect(() => {
    console.log('🔍 [hasAdminAccess State Changed]', {
      hasAdminAccess,
      adminUsername,
      user: user ? { USERID: user.USERID || user.id, BADGENUMBER: user.BADGENUMBER } : null
    });
  }, [hasAdminAccess, adminUsername, user]);

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('dtrActiveTab', activeTab);
    console.log('🔄 [DtrChecker] Active tab saved:', activeTab);
  }, [activeTab]);

  // Generate period options based on selected filter
  const periodOptions = useMemo(() => {
    if (selectedFilter !== 'This Month' && selectedFilter !== 'Last Month') return [];
    
    const now = new Date();
    let targetYear, targetMonth;
    
    if (selectedFilter === 'This Month') {
      targetYear = now.getFullYear();
      targetMonth = now.getMonth() + 1;
    } else {
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
      if (targetMonth === 0) {
        targetYear--;
        targetMonth = 12;
      }
    }
    
    const monthName = new Date(targetYear, targetMonth - 1, 1).toLocaleString('en-US', { month: 'short' });
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    
    return [
      { value: 'full', label: `Full Month (${monthName} 1-${lastDay})` },
      { value: 'first_half', label: `1st Half (${monthName} 1-15)` },
      { value: 'second_half', label: `2nd Half (${monthName} 16-${lastDay})` }
    ];
  }, [selectedFilter]);

  const isPeriodSelectable = (selectedFilter === 'This Month' || selectedFilter === 'Last Month') && periodOptions.length > 0;

  // Reset period when filter changes
  useEffect(() => {
    setSelectedPeriod('full');
  }, [selectedFilter]);

  // Persist DTR Check states to localStorage
  useEffect(() => {
    localStorage.setItem('dtrSelectedFilter', selectedFilter);
    console.log('🔄 [DtrChecker] Selected filter saved:', selectedFilter);
  }, [selectedFilter]);

  useEffect(() => {
    localStorage.setItem('dtrSelectedView', selectedView);
    console.log('🔄 [DtrChecker] Selected view saved:', selectedView);
  }, [selectedView]);

  // Add debugging effect to track user changes
  useEffect(() => {
    console.log('🔍 [DtrChecker] User context changed:', {
      hasUser: !!user,
      userId: user?.id,
      userUSERID: user?.USERID,
      userName: user?.NAME,
      name: user?.name,
      loadingAuth
    });
    
    // Only redirect if auth is not loading and no user is found
    if (!loadingAuth && !user) {
      // Check if there's a stored token as a fallback
      const storedToken = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('authUser');
      
      if (storedToken && storedUser) {
        console.log('🔄 [DtrChecker] Found stored auth data, waiting for auth context to load...');
        return; // Don't redirect yet, let auth context handle it
      } else {
        // Add a delay before redirecting to give auth context more time
        console.log('⚠️ [DtrChecker] No user and no stored auth data - will redirect in 2 seconds');
        const redirectTimer = setTimeout(() => {
          console.log('⚠️ [DtrChecker] Redirecting to login page after delay');
          navigate('/login');
        }, 2000);
        
        // Cleanup timer if component unmounts or user loads
        return () => clearTimeout(redirectTimer);
      }
    } else if (user) {
      const userId = user.id || user.USERID;
      console.log(`✅ [DtrChecker] Will fetch data for USERID: ${userId}, User: ${user.NAME || user.name}`);
    }
  }, [user, navigate, loadingAuth]);

  // --- Automatic session timeout logic ---
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        // Check if user logged in via biometric
        const authMethod = localStorage.getItem('authMethod');
        
        // Clear biometric states before logout
        try {
          localStorage.removeItem('biometricScanningState');
          localStorage.removeItem('fingerprintCaptureState');
          localStorage.removeItem('biometricMatchState');
          localStorage.removeItem('lastBiometricUser');
          localStorage.removeItem('biometricSessionData');
          localStorage.removeItem('biometricScore');
          localStorage.removeItem('biometricConfidence');
          localStorage.removeItem('lastFingerprintData');
          localStorage.removeItem('biometricMatchHistory');
          console.log('🔄 Cleared biometric states due to session timeout');
        } catch (error) {
          console.warn('⚠️ Error clearing biometric states:', error);
        }
        
        logout();
        
        // Redirect to login page after timeout
        navigate('/login');
      }, SESSION_TIMEOUT_MS);
    };

    // List of events that indicate user activity
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    // Set up event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });

    // Initial timer
    resetTimer();

    // Cleanup
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
    };
  }, [user, logout, navigate]);

  // Session persistence on page refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save session state before page unload
      if (user) {
        localStorage.setItem('dtrSessionActive', 'true');
        localStorage.setItem('dtrSessionTimestamp', Date.now().toString());
      }
    };

    const handlePageShow = () => {
      // Check if session should be restored
      const sessionActive = localStorage.getItem('dtrSessionActive');
      const sessionTimestamp = localStorage.getItem('dtrSessionTimestamp');
      
      if (sessionActive === 'true' && sessionTimestamp) {
        const timeSinceLastActivity = Date.now() - parseInt(sessionTimestamp);
        const maxInactiveTime = 60 * 60 * 1000; // 1 hour
        
        if (timeSinceLastActivity < maxInactiveTime) {
          console.log('🔄 Restoring session after page refresh');
          // Session is still valid, no need to redirect
          return;
        } else {
          console.log('⚠️ Session expired due to inactivity');
          localStorage.removeItem('dtrSessionActive');
          localStorage.removeItem('dtrSessionTimestamp');
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [user]);

  // Fetch current designation (ispresent = 1) for logged-in user when 201 Files > My Leave Credits is active
  useEffect(() => {
    const fetchCurrentDesignation = async () => {
      if (activeTab !== '201-files' || filesSubTab !== 'leave-credits') return;
      if (!user || !(user.USERID || user.id)) return;
      try {
        setDesignationLoading(true);
        // Find employee objid by USERID
        const empResp = await api.get('/201-employees');
        const employees = Array.isArray(empResp.data?.data) ? empResp.data.data : (Array.isArray(empResp.data) ? empResp.data : []);
        const dtrUserId = String(user.USERID || user.id);
        const me = employees.find(e => String(e.dtruserid) === dtrUserId);
        if (!me) {
          setCurrentDesignation(null);
          setDesignationLoading(false);
          return;
        }
        // Get designations and pick the one with ispresent = 1 for this emp
        const desResp = await api.get('/employee-designations', { params: { status: 'all' } });
        const list = Array.isArray(desResp.data?.data) ? desResp.data.data : [];
        const current = list.find(r => String(r.emp_objid) === String(me.objid) && String(r.ispresent) === '1');
        setCurrentDesignation(current || null);
      } catch (e) {
        setCurrentDesignation(null);
      } finally {
        setDesignationLoading(false);
      }
    };
    fetchCurrentDesignation();
  }, [activeTab, filesSubTab, user]);

  // Fetch my locator records when locator sub-tab is active
  useEffect(() => {
    const fetchMyLocators = async () => {
      if (activeTab !== '201-files' || filesSubTab !== 'locator' || !user || !(user.USERID || user.id)) {
        return;
      }
      
      try {
        setMyLocatorLoading(true);
        const userId = user.USERID || user.id;
        
        // Get employee objid from dtruserid
        const empResp = await api.get('/201-employees');
        const employees = Array.isArray(empResp.data?.data) ? empResp.data.data : [];
        const currentEmployee = employees.find(emp => String(emp.dtruserid) === String(userId));
        
        if (!currentEmployee || !currentEmployee.objid) {
          setMyLocatorRows([]);
          return;
        }
        
        // Fetch locator data for this employee
        const locatorResp = await api.get('/employee-locators', {
          params: { emp_objid: currentEmployee.objid }
        });
        
        const locators = Array.isArray(locatorResp.data?.data) ? locatorResp.data.data : [];
        // Sort by createddate descending (most recent first)
        const sortedLocators = locators.sort((a, b) => {
          const dateA = new Date(a.createddate || 0);
          const dateB = new Date(b.createddate || 0);
          return dateB - dateA;
        });
        
        setMyLocatorRows(sortedLocators);
      } catch (error) {
        console.error('Error fetching locator data:', error);
        setMyLocatorRows([]);
      } finally {
        setMyLocatorLoading(false);
      }
    };
    
    fetchMyLocators();
  }, [activeTab, filesSubTab, user]);

  // Update the shift schedule fetch to be more explicit and add logging
  useEffect(() => {
    const fetchShiftSchedule = async () => {
      if (user && (user.id || user.USERID)) {
        const userId = user.id || user.USERID;
        console.log(`�� [DtrChecker] Fetching shift schedule for USERID: ${userId}`);
        
        try {
          const response = await api.get(`/employees/${userId}/shift-schedule`);
          const data = response.data;
          
          console.log(`✅ [DtrChecker] Shift schedule response for ${data.employee?.NAME}`);
          
          if (data && data.shiftSchedule) {
            const shiftSchedule = data.shiftSchedule;
            console.log('🔍 [DtrChecker] Setting shift schedule:', {
              hasShiftSchedule: !!shiftSchedule,
              shiftName: shiftSchedule.SHIFTNAME,
              assignedShifts: data.assignedShifts?.length || 0
            });
            setShiftSchedule({
              SHIFTNO: shiftSchedule.SHIFTNO,
              SHIFTNAME: shiftSchedule.SHIFTNAME,
              SHIFT_AMCHECKIN: shiftSchedule.SHIFT_AMCHECKIN,
              SHIFT_AMCHECKIN_START: shiftSchedule.SHIFT_AMCHECKIN_START,
              SHIFT_AMCHECKIN_END: shiftSchedule.SHIFT_AMCHECKIN_END,
              SHIFT_AMCHECKOUT: shiftSchedule.SHIFT_AMCHECKOUT,
              SHIFT_AMCHECKOUT_START: shiftSchedule.SHIFT_AMCHECKOUT_START,
              SHIFT_AMCHECKOUT_END: shiftSchedule.SHIFT_AMCHECKOUT_END,
              SHIFT_PMCHECKIN: shiftSchedule.SHIFT_PMCHECKIN,
              SHIFT_PMCHECKIN_START: shiftSchedule.SHIFT_PMCHECKIN_START,
              SHIFT_PMCHECKIN_END: shiftSchedule.SHIFT_PMCHECKIN_END,
              SHIFT_PMCHECKOUT: shiftSchedule.SHIFT_PMCHECKOUT,
              SHIFT_PMCHECKOUT_START: shiftSchedule.SHIFT_PMCHECKOUT_START,
              SHIFT_PMCHECKOUT_END: shiftSchedule.SHIFT_PMCHECKOUT_END,
              assignedShifts: data.assignedShifts || []
            });
          } else {
            console.log('⚠️ [DtrChecker] No shift schedule in response:', data);
            setShiftSchedule(null);
          }
        } catch (err) {
          console.error('❌ [DtrChecker] Error fetching shift schedule:', err);
          setShiftSchedule(null);
        }
      }
    };
    fetchShiftSchedule();
  }, [user]);

  // Update the locator data fetch similarly
  useEffect(() => {
    const fetchLocatorData = async () => {
      if (user && (user.id || user.USERID)) {
        const userId = user.id || user.USERID;
        console.log(`�� [DtrChecker] Fetching locator data for USERID: ${userId}`);
        
        try {
          const response = await api.get(`/locator/entries/${userId}`);
          setLocatorData(response.data || []);
          console.log(`✅ [DtrChecker] Loaded ${response.data?.length || 0} locator entries`);
        } catch (err) {
          console.error('❌ [DtrChecker] Error fetching locator data:', err);
          setLocatorData([]);
        }
      }
    };
    fetchLocatorData();
  }, [user]);

  // Update the filter to use USERID consistently
  const filteredLocatorData = Array.isArray(locatorData)
    ? locatorData.filter(l => String(l.LOCUSERID) === String(user?.id || user?.USERID))
    : [];

  // Handle SSN change
  const handleSsnChange = async (e) => {
    e.preventDefault();
    setSsnError('');
    setSsnSuccess('');
    setIsChangingSsn(true);

    try {
      const response = await api.post('/auth/change-pin', {
        currentSsn: ssnForm.currentSsn,
        newPin: ssnForm.newSsn,
        confirmPin: ssnForm.confirmSsn
      });

      if (response.data.success) {
        setSsnSuccess('PIN changed successfully!');
        setSsnForm({ currentSsn: '', newSsn: '', confirmSsn: '' });
        setTimeout(() => {
          setShowSsnModal(false);
          setSsnSuccess('');
        }, 2000);
      } else {
        setSsnError(response.data.message || 'Failed to change PIN');
      }
    } catch (error) {
      setSsnError(error.response?.data?.message || 'Failed to change PIN. Please try again.');
    } finally {
      setIsChangingSsn(false);
    }
  };


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownOpen && !event.target.closest('.user-dropdown')) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userDropdownOpen]);


  if (loadingAuth || checkingPds) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">
            {loadingAuth ? 'Checking authentication...' : 'Verifying PDS completion...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header - Employee Portal */}
      <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-3 rounded-xl">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Employee Portal</h1>
              <p className="text-sm text-gray-500">Your personal HR information center</p>
            </div>
          </div>
          
          {/* Logged-in User Info with Dropdown - Matching DTR Management */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="relative user-dropdown">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
              >
                {/* User Name */}
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {user?.NAME || user?.name || user?.firstname + ' ' + user?.lastname || 'Employee'}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {user?.TITLE || user?.title || 'Employee'}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    ID: {user?.USERID || user?.userid || user?.id || 'N/A'}
                  </div>
                </div>
                
                {/* User Photo - Use PDS photo if available, otherwise use user.PHOTO */}
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md overflow-hidden relative">
                  {(() => {
                    // Determine which photo to use (PDS photo takes priority)
                    const photoToUse = pdsPhoto || user?.PHOTO;
                    console.log('🔍 [DtrChecker] Avatar render - photoToUse:', !!photoToUse, 'pdsPhoto:', !!pdsPhoto, 'user.PHOTO:', !!user?.PHOTO);
                    
                    const photoSrc = photoToUse 
                      ? (typeof photoToUse === 'string' && photoToUse.startsWith('data:') 
                          ? photoToUse 
                          : `data:image/jpeg;base64,${photoToUse}`)
                      : null;
                    
                    console.log('🔍 [DtrChecker] Avatar render - photoSrc:', !!photoSrc);
                    
                    if (photoSrc) {
                      return (
                        <>
                          <img 
                            src={photoSrc}
                      alt={user?.NAME || user?.name || 'User'} 
                      className="w-full h-full object-cover rounded-xl"
                      onError={(e) => {
                        e.target.style.display = 'none';
                              if (e.target.nextSibling) {
                        e.target.nextSibling.style.display = 'flex';
                              }
                      }}
                    />
                          <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg absolute inset-0" style={{display: 'none'}}>
                    {(user?.NAME || user?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                        </>
                      );
                    } else {
                      return (
                        <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                          {(user?.NAME || user?.name || 'U').charAt(0).toUpperCase()}
                        </div>
                      );
                    }
                  })()}
                </div>
                
                {/* Dropdown Arrow */}
                <svg 
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                    userDropdownOpen ? 'rotate-180' : ''
                  }`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <button
                    onClick={() => {
                      setShowSsnModal(true);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1 1 21 9z" />
                    </svg>
                    <span>Change PIN</span>
                  </button>
                  
                  {/* Admin Panel - Only show if user has privilege value of 3 */}
                  {user?.privilege !== undefined && user?.privilege !== null && user?.privilege === 3 && (
                    <>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        onClick={() => {
                          navigate('/hris-management');
                          setUserDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Admin Panel</span>
                      </button>
                    </>
                  )}
                  
                  {/* Admin Access - Show if portal user has active sysusers record with status = 1 */}
                  {hasAdminAccess && (
                    <>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        onClick={async () => {
                          try {
                            setUserDropdownOpen(false);
                            
                            // Store credentials in sessionStorage to pass to login page (survives logout)
                            const portalUsername = user?.BADGENUMBER || user?.username;
                            
                            // Try to create admin session using bridge endpoint BEFORE logout
                            // This way we can use the existing portal token
                            try {
                              console.log('🔗 Attempting to create admin session from portal...');
                              const response = await api.post('/auth/portal/admin-session');
                              
                              if (response.data.success && response.data.token && response.data.user) {
                                // Success! Store admin session
                                const adminUser = response.data.user;
                                const adminToken = response.data.token;
                                
                                // Ensure 'id' property exists
                                const processedUserData = { ...adminUser };
                                if (processedUserData.USERID !== undefined && processedUserData.id === undefined) {
                                  processedUserData.id = processedUserData.USERID;
                                }
                                
                                // Store admin session (replaces portal session)
                                localStorage.setItem('authToken', adminToken);
                                localStorage.setItem('authUser', JSON.stringify(processedUserData));
                                localStorage.setItem('authMethod', 'admin');
                                
                                // Update API header
                                api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
                                
                                console.log('✅ Admin session created successfully, redirecting to HRIS Management');
                                
                                // Don't call logout() - we're switching sessions, not logging out
                                // The admin session replaces the portal session
                                
                                // Navigate to HRIS Management
                                setTimeout(() => {
                                  window.location.href = '/hris-management';
                                }, 200);
                                return;
                              }
                            } catch (bridgeError) {
                              console.warn('⚠️ Bridge authentication failed, falling back to login page:', bridgeError);
                              console.warn('Bridge error details:', bridgeError.response?.data || bridgeError.message);
                              // Fall through to manual login flow
                            }
                            
                            // Fallback: Store flags for manual login
                            sessionStorage.setItem('adminAccessRequest', 'true');
                            sessionStorage.setItem('adminAccessUsername', adminUsername || '');
                            sessionStorage.setItem('portalUsername', portalUsername || '');
                            
                            // Logout portal session
                            logout();
                            
                            // Navigate to login page for manual authentication
                            setTimeout(() => {
                              window.location.href = '/login?mode=admin';
                            }, 200);
                          } catch (error) {
                            console.error('Error in Admin Access flow:', error);
                            setUserDropdownOpen(false);
                          }
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Admin Access</span>
                      </button>
                    </>
                  )}
                  
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                      navigate('/login');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex space-x-1">
          <button
            onClick={() => {
              if (!pdsCheckComplete) {
                alert('Please complete your PDS first before accessing this feature.');
                return;
              }
              setActiveTab('dtr-check');
            }}
            className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
              activeTab === 'dtr-check'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>DTR Check</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('my-pds')}
            className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
              activeTab === 'my-pds'
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>My PDS</span>
            </div>
          </button>
          
          <button
            onClick={() => {
              if (!pdsCheckComplete) {
                alert('Please complete your PDS first before accessing this feature.');
                return;
              }
              setActiveTab('201-files');
            }}
            className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
              activeTab === '201-files'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>201 Files</span>
            </div>
          </button>
          
          <button
            onClick={() => {
              if (!pdsCheckComplete) {
                alert('Please complete your PDS first before accessing this feature.');
                return;
              }
              setActiveTab('payroll');
            }}
            className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
              activeTab === 'payroll'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold">₱</span>
              <span>Payroll</span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Content Area - Full Width & Height */}
      <main className="flex-1 flex flex-col">
        {/* DTR Check Tab Content */}
        {activeTab === 'dtr-check' && (
          <>
            {/* Filters Section */}
            <div className="bg-white border-b border-gray-200 px-3 sm:px-4 md:px-6 py-4 flex-shrink-0">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
                {/* Shift Schedule Section */}
                {shiftSchedule && (
                  <div className="w-full md:flex-1 md:min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Shift Schedule
                    </label>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                      <div className="flex items-start space-x-2">
                        <div className="bg-blue-500 p-1.5 rounded flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1 overflow-x-auto">
                          <div className="space-y-1.5 text-[11px] text-blue-800 min-w-max sm:min-w-0">
                            <div
                              className="grid gap-x-2 sm:gap-x-3 mb-2 pb-2 border-b border-blue-300 text-[10px] font-bold text-blue-900 uppercase"
                              style={{ 
                                gridTemplateColumns: 'minmax(100px, 1fr) minmax(60px, 80px) minmax(100px, 120px)',
                                minWidth: '280px'
                              }}
                            >
                              <div className="truncate">Shift Name</div>
                              <div className="truncate">Mode</div>
                              <div className="truncate">Checktimes</div>
                          </div>
                          
                            {(Array.isArray(shiftSchedule.assignedShifts) && shiftSchedule.assignedShifts.length > 0
                              ? shiftSchedule.assignedShifts
                              : [{
                                  shiftName: shiftSchedule.SHIFTNAME || 'Assigned Shift',
                                  shiftMode: shiftSchedule.SHIFT_AMCHECKIN && shiftSchedule.SHIFT_PMCHECKOUT
                                    ? 'AMPM'
                                    : shiftSchedule.SHIFT_AMCHECKIN
                                      ? 'AM'
                                      : shiftSchedule.SHIFT_PMCHECKIN
                                        ? 'PM'
                                        : '—',
                                  checkIn: shiftSchedule.SHIFT_AMCHECKIN || shiftSchedule.SHIFT_PMCHECKIN,
                                  checkOut: shiftSchedule.SHIFT_PMCHECKOUT || shiftSchedule.SHIFT_AMCHECKOUT
                                }]
                            ).map((assignedShift, idx) => (
                              <div
                                key={`${assignedShift.shiftName || 'shift'}-${assignedShift.period || assignedShift.shiftMode || idx}`}
                                className="grid gap-x-2 sm:gap-x-3 items-center text-xs font-semibold"
                                style={{ 
                                  gridTemplateColumns: 'minmax(100px, 1fr) minmax(60px, 80px) minmax(100px, 120px)',
                                  minWidth: '280px'
                                }}
                              >
                                <div className="truncate">{assignedShift.shiftName || 'Shift'}</div>
                                <div className="text-blue-600 truncate">{assignedShift.shiftMode || assignedShift.period || 'Mode'}</div>
                                <div className="text-blue-900 truncate text-[10px] sm:text-xs">
                                  {(getTimeOnly(assignedShift.checkIn) || '—') + ' – ' + (getTimeOnly(assignedShift.checkOut) || '—')}
                                </div>
                                </div>
                            ))}
                                </div>
                              </div>
                                </div>
                    </div>
                  </div>
                )}

                {/* Date Filter Section */}
                <div className="w-full md:flex-1 md:max-w-[10rem]">
                  <label htmlFor="dateFilter" className="block text-sm font-medium text-gray-700 mb-1">
                    Select Date Range
                  </label>
                  <select
                    id="dateFilter"
                    value={selectedFilter}
                    onChange={(e) => setSelectedFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                  >
                    <option value="Today">Today</option>
                    <option value="Last 2 Weeks">Last 2 Weeks</option>
                    <option value="This Month">This Month</option>
                    <option value="Last Month">Last Month</option>
                  </select>
                </div>

                {/* Period Filter Section */}
                <div className="w-full md:flex-1 md:max-w-[15.68rem]">
                  <label htmlFor="periodFilter" className="block text-sm font-medium text-gray-700 mb-1">
                    Period
                  </label>
                  <select
                    id="periodFilter"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    disabled={!isPeriodSelectable}
                    className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${!isPeriodSelectable ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200 focus:ring-0 focus:border-gray-200' : 'border-gray-300'}`}
                  >
                    {isPeriodSelectable
                      ? periodOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      : (
                        <option value="full">Not available for this range</option>
                      )}
                  </select>
                </div>

                {/* View Mode Section */}
                <div className="w-full md:flex-1 md:max-w-xs">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    View Mode
                  </label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setSelectedView('My Shift')}
                      className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 ${
                        selectedView === 'My Shift'
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="truncate">My Shift</span>
                    </button>
                    <button
                      onClick={() => setSelectedView('Raw Logs')}
                      className={`flex-1 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-1 sm:space-x-2 ${
                        selectedView === 'Raw Logs'
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate">Raw Logs</span>
                    </button>
                  </div>
                </div>

                {/* Print Button */}
                <div className="flex justify-start md:justify-end items-end">
                  <button
                    onClick={() => {
                      if (selectedView === 'My Shift') {
                        setShowPrintOptionsModal(true);
                      } else {
                        setShowPrintModal(true);
                      }
                    }}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-white text-blue-600 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-all duration-200 border border-gray-300 flex-shrink-0"
                    title="Print DTR"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area - Maximized */}
            <div className="flex-1 bg-white overflow-hidden">
              {selectedView === 'My Shift' ? (
                <MyShiftView 
                  user={user} 
                  selectedFilter={selectedFilter} 
                  shiftSchedule={shiftSchedule} 
                  locatorData={locatorData}
                  selectedPeriod={selectedPeriod}
                  onLogsProcessed={setProcessedLogs}
                />
              ) : (
                <RawLogsView_Dtr 
                  user={user} 
                  selectedFilter={selectedFilter} 
                  locatorData={locatorData}
                  selectedPeriod={selectedPeriod}
                  onLogsProcessed={setRawLogs}
                />
              )}
            </div>
          </>
        )}

        {/* My PDS Tab Content */}
        {activeTab === 'my-pds' && (
          <div className="flex-1 p-6 overflow-y-auto">
            {!pdsCheckComplete && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h3 className="text-red-800 font-semibold">PDS Completion Required</h3>
                    <p className="text-red-700 text-sm mt-1">{pdsMessage}</p>
                    <p className="text-red-700 text-sm mt-2">You must complete these required fields before accessing other features.</p>
                  </div>
                </div>
              </div>
            )}
            <PdsDtrChecker 
              onBack={() => {
                if (!pdsCheckComplete) {
                  alert('Please complete your PDS first before accessing other features.');
                  return;
                }
                setActiveTab('dtr-check');
              }}
              onSave={async () => {
                // PDS saved successfully
                console.log('PDS saved successfully');
                // Re-check PDS after save
                try {
                  const response = await api.get('/pds-dtrchecker/me');
                  
                  if (response.data.success && response.data.data) {
                    const validation = validatePdsRequiredFields(response.data.data);
                    
                    if (validation.valid) {
                      setPdsCheckComplete(true);
                      setPdsMessage('');
                    } else {
                      setPdsCheckComplete(false);
                      setPdsMessage(validation.message);
                    }
                  }
                } catch (error) {
                  console.error('Error re-checking PDS after save:', error);
                }
              }}
            />
          </div>
        )}

        {/* 201 Files Tab Content */}
        {activeTab === '201-files' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sub-Tabs Navigation */}
            <div className="bg-white border-r border-gray-200 px-4 py-6 w-48 flex-shrink-0">
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => setFilesSubTab('leave-credits')}
                  className={`py-3 px-4 border-r-2 font-medium text-sm transition-colors text-left ${
                    filesSubTab === 'leave-credits'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  My Leave Credits
                </button>
                <button
                  onClick={() => setFilesSubTab('leave')}
                  className={`py-3 px-4 border-r-2 font-medium text-sm transition-colors text-left ${
                    filesSubTab === 'leave'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Leave
                </button>
                <button
                  onClick={() => setFilesSubTab('cdo-credits')}
                  className={`py-3 px-4 border-r-2 font-medium text-sm transition-colors text-left ${
                    filesSubTab === 'cdo-credits'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  CDO Credits
                </button>
                <button
                  onClick={() => setFilesSubTab('travel')}
                  className={`py-3 px-4 border-r-2 font-medium text-sm transition-colors text-left ${
                    filesSubTab === 'travel'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Travel
                </button>
                <button
                  onClick={() => setFilesSubTab('locator')}
                  className={`py-3 px-4 border-r-2 font-medium text-sm transition-colors text-left ${
                    filesSubTab === 'locator'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Locator
                </button>
              </div>
            </div>

            {/* Sub-Tab Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-6xl mx-auto">
                {filesSubTab === 'leave-credits' && (
                  <>
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">Current Designation</h3>
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        {designationLoading ? (
                          <div className="text-sm text-gray-500">Loading designation...</div>
                        ) : currentDesignation ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-gray-500">Designation</div>
                              <div className="font-medium">{currentDesignation.rankname || '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Position</div>
                              <div className="font-medium">{currentDesignation.position || '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Department</div>
                              <div className="font-medium">{currentDesignation.departmentname || '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Appointment</div>
                              <div className="font-medium">{currentDesignation.appointmentname || '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Appointment Date</div>
                              <div className="font-medium">{currentDesignation.appointmentdate ? String(currentDesignation.appointmentdate).slice(0,10) : '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Status</div>
                              <div>
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Present</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">Not available</div>
                        )}
                      </div>
                    </div>
                    <MyLeaveRecords />
                  </>
                )}
                {filesSubTab === 'leave' && <MyLeaveTransactions />}
                {filesSubTab === 'cdo-credits' && <MyDtrCdoCredit />}
                {filesSubTab === 'travel' && <MyTravelPortal />}
                {filesSubTab === 'locator' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow">
                      <div className="p-4 flex items-center justify-between border-b">
                        <div className="font-semibold">My Locator Records</div>
                        <button
                          className="text-sm text-blue-600 hover:text-blue-800"
                          onClick={async () => {
                            setMyLocatorLoading(true);
                            try {
                              const userId = user.USERID || user.id;
                              const empResp = await api.get('/201-employees');
                              const employees = Array.isArray(empResp.data?.data) ? empResp.data.data : [];
                              const currentEmployee = employees.find(emp => String(emp.dtruserid) === String(userId));
                              
                              if (currentEmployee?.objid) {
                                const locatorResp = await api.get('/employee-locators', {
                                  params: { emp_objid: currentEmployee.objid }
                                });
                                const locators = Array.isArray(locatorResp.data?.data) ? locatorResp.data.data : [];
                                const sortedLocators = locators.sort((a, b) => {
                                  const dateA = new Date(a.createddate || 0);
                                  const dateB = new Date(b.createddate || 0);
                                  return dateB - dateA;
                                });
                                setMyLocatorRows(sortedLocators);
                              }
                            } catch (error) {
                              console.error('Error refreshing locator data:', error);
                            } finally {
                              setMyLocatorLoading(false);
                            }
                          }}
                        >
                          Refresh
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locator No.</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time Departure</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time Arrival</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {myLocatorLoading ? (
                              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
                            ) : (myLocatorRows || []).length === 0 ? (
                              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No locator records</td></tr>
                            ) : (
                              (myLocatorRows || []).map(r => {
                                // Format date as MM/DD/YYYY
                                const formatDate = (dateStr) => {
                                  if (!dateStr) return '—';
                                  const str = String(dateStr).slice(0, 10);
                                  if (str.length === 10 && str.includes('-')) {
                                    const [y, m, d] = str.split('-');
                                    return `${m}/${d}/${y}`;
                                  }
                                  return str;
                                };
                                
                                // Format time as HH:MM (remove seconds if present)
                                const formatTime = (timeValue) => {
                                  if (!timeValue) return '—';
                                  const str = String(timeValue);
                                  // If it's already in HH:MM format, return it
                                  if (/^\d{2}:\d{2}$/.test(str)) return str;
                                  // If it's in HH:MM:SS format, extract HH:MM
                                  if (/^\d{2}:\d{2}:\d{2}$/.test(str)) return str.slice(0, 5);
                                  // If it includes 'T' (ISO datetime format), extract time portion
                                  if (str.includes('T')) {
                                    const match = str.match(/T(\d{2}:\d{2})/);
                                    if (match) return match[1];
                                  }
                                  // If it's a datetime string, try to extract time portion
                                  if (str.includes(' ') || str.includes('T')) {
                                    const parts = str.split(/[ T]/);
                                    if (parts.length > 1 && /^\d{2}:\d{2}/.test(parts[1])) {
                                      return parts[1].slice(0, 5);
                                    }
                                  }
                                  // Return as-is if it matches HH:MM pattern at the start
                                  const timeMatch = str.match(/^(\d{2}:\d{2})/);
                                  return timeMatch ? timeMatch[1] : '—';
                                };
                                
                                const statusColor = (() => {
                                  const normalized = (r.locstatus || '').trim();
                                  if (normalized === 'Approved') return 'bg-green-100 text-green-800';
                                  if (normalized === 'Rejected') return 'bg-red-100 text-red-800';
                                  if (normalized === 'Returned') return 'bg-blue-100 text-blue-800';
                                  if (normalized === 'Cancelled') return 'bg-gray-100 text-gray-800';
                                  if (normalized === 'For Approval') return 'bg-yellow-100 text-yellow-800';
                                  return 'bg-blue-100 text-blue-800';
                                })();
                                
                                return (
                                  <tr key={r.objid}>
                                    <td className="px-4 py-2">{r.locatorno || '—'}</td>
                                    <td className="px-4 py-2">{formatDate(r.locatordate)}</td>
                                    <td className="px-4 py-2">{r.locdestination || '—'}</td>
                                    <td className="px-4 py-2 max-w-md truncate" title={r.locpurpose || ''}>{r.locpurpose || '—'}</td>
                                    <td className="px-4 py-2">{formatTime(r.loctimedeparture)}</td>
                                    <td className="px-4 py-2">{formatTime(r.loctimearrival)}</td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColor}`}>
                                        {(r.locstatus && r.locstatus.trim()) || 'For Approval'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2">
                                      <button
                                        onClick={() => openLocatorPrintWindow(r)}
                                        className="text-green-600 hover:text-green-800 transition-colors"
                                        title="Print Locator"
                                      >
                                        🖨️
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payroll Tab Content */}
        {activeTab === 'payroll' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg shadow-lg p-8 text-white mb-6">
                <h2 className="text-3xl font-bold mb-2">💰 Payroll Information</h2>
                <p className="text-purple-100">Your Salary and Compensation Details</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">Current Month</p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">Last Payslip</p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">Next Pay Date</p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded">
                <div className="flex items-start space-x-3">
                  <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h4 className="text-lg font-semibold text-yellow-800 mb-2">Under Development</h4>
                    <p className="text-sm text-yellow-700 mb-4">
                      The Payroll module is currently under development. Soon you'll be able to:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-sm text-yellow-700 ml-4">
                      <li>View your current and past payslips</li>
                      <li>Download payslip PDFs</li>
                      <li>View deductions breakdown (SSS, PhilHealth, Pag-IBIG, Tax)</li>
                      <li>Track loans and salary advances</li>
                      <li>View year-to-date earnings</li>
                      <li>Access BIR Form 2316 (Annual ITR)</li>
                      <li>View 13th month pay computation</li>
                    </ul>
                    <p className="text-sm text-yellow-700 mt-4">
                      <strong>Expected Release:</strong> Integrated with DTR system for automatic computation
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded mt-6">
                <div className="flex">
                  <svg className="w-5 h-5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-purple-700">
                      <strong>Note:</strong> Payroll calculations will be automatically based on your DTR attendance records to ensure accuracy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Change PIN Modal - Keep existing modal code */}
      {showSsnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-800">Change Your PIN</h3>
                <button
                  onClick={() => {
                    setShowSsnModal(false);
                    setSsnForm({ currentSsn: '', newSsn: '', confirmSsn: '' });
                    setSsnError('');
                    setSsnSuccess('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <strong>Security Notice:</strong> Your PIN is used to access your personal time records. Keep it secure and don't share it with others.
                  </div>
                </div>
              </div>

              <form onSubmit={handleSsnChange} className="space-y-4">
                <div>
                  <label htmlFor="currentSsn" className="block text-sm font-semibold text-gray-700 mb-2">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    id="currentSsn"
                    value={ssnForm.currentSsn}
                    onChange={(e) => setSsnForm({...ssnForm, currentSsn: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your current PIN"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="newSsn" className="block text-sm font-semibold text-gray-700 mb-2">
                    New PIN
                  </label>
                  <input
                    type="password"
                    id="newSsn"
                    value={ssnForm.newSsn}
                    onChange={(e) => setSsnForm({...ssnForm, newSsn: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your new PIN"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="confirmSsn" className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm New PIN
                  </label>
                  <input
                    type="password"
                    id="confirmSsn"
                    value={ssnForm.confirmSsn}
                    onChange={(e) => setSsnForm({...ssnForm, confirmSsn: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Confirm your new PIN"
                    required
                  />
                </div>

                {ssnError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 text-sm">{ssnError}</p>
                  </div>
                )}

                {ssnSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm">{ssnSuccess}</p>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSsnModal(false);
                      setSsnForm({ currentSsn: '', newSsn: '', confirmSsn: '' });
                      setSsnError('');
                      setSsnSuccess('');
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingSsn}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    {isChangingSsn ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Changing...</span>
                      </>
                    ) : (
                      <span>Change PIN</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Print Options Modal */}
      {showPrintOptionsModal && selectedView === 'My Shift' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Print Options</h2>
            
            {/* Print Format Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Print Format</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="printFormat"
                    value="basic"
                    checked={printFormat === 'basic'}
                    onChange={(e) => setPrintFormat(e.target.value)}
                    className="mr-2"
                  />
                  <span>Basic Format</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="printFormat"
                    value="annotations"
                    checked={printFormat === 'annotations'}
                    onChange={(e) => setPrintFormat(e.target.value)}
                    className="mr-2"
                  />
                  <span>With Annotations</span>
                </label>
              </div>
            </div>

            {/* Annotation Selection (only shown when "With Annotations" is selected) */}
            {printFormat === 'annotations' && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-gray-700">Select Annotations</label>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAnnotations({
                          locator: true,
                          fixlog: true,
                          leave: true,
                          travel: true,
                          cdo: true,
                          holiday: true,
                          weekend: true,
                          absent: true
                        });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAnnotations({
                          locator: false,
                          fixlog: false,
                          leave: false,
                          travel: false,
                          cdo: false,
                          holiday: false,
                          weekend: false,
                          absent: false
                        });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.locator}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, locator: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">📌 Locator Backfill</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.fixlog}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, fixlog: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">🔒 Fix Log Override</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.leave}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, leave: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Leave</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.travel}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, travel: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Travel</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.cdo}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, cdo: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">CDO</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.holiday}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, holiday: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Holiday</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.weekend}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, weekend: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Weekend</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedAnnotations.absent}
                      onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, absent: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm">Absent</span>
                  </label>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowPrintOptionsModal(false);
                  setPrintFormat('basic');
                }}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPrintOptionsModal(false);
                  setShowPrintModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modals */}
      {showPrintModal && selectedView === 'My Shift' && printFormat === 'basic' && (
        <PrintMyDTRChecker
          user={user}
          selectedFilter={selectedFilter}
          selectedPeriod={selectedPeriod}
          processedLogs={processedLogs}
          shiftSchedule={shiftSchedule}
          onClose={() => {
            setShowPrintModal(false);
            setPrintFormat('basic');
          }}
        />
      )}

      {showPrintModal && selectedView === 'My Shift' && printFormat === 'annotations' && (
        <PrintMyDTRCheckerWithAnnotations
          user={user}
          selectedFilter={selectedFilter}
          selectedPeriod={selectedPeriod}
          processedLogs={processedLogs}
          shiftSchedule={shiftSchedule}
          selectedAnnotations={selectedAnnotations}
          onClose={() => {
            setShowPrintModal(false);
            setPrintFormat('basic');
          }}
        />
      )}

      {showPrintModal && selectedView === 'Raw Logs' && (
        <PrintMyDTRRaw
          user={user}
          selectedFilter={selectedFilter}
          selectedPeriod={selectedPeriod}
          logs={rawLogs}
          onClose={() => setShowPrintModal(false)}
        />
      )}

    </div>
  );
};

export default DtrChecker;
