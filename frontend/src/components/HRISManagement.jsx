import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../authContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

// DTR Module Components
import TimeLogsManagement from './DTR/TimeLogsManagement';
import DTRManageChecktimeTabs from './DTR/DTRManageChecktimeTabs';
import ComputeAttendance from './DTR/ComputeAttendance';
import GenerateDTRReport from './DTR/GenerateDTRReport';
import ComputedAttendanceReport from './DTR/computedAttendanceReport';

import PrintLocatorEntries from './DTR/printLocatorEntries';
import DtrCheckerKiosk from './DTR/DtrCheckerKiosk';
import DTRPortalUsersTabs from './DTR/DTRPortalUsersTabs';
import PrintEmployeeList from './DTR/printEmployeeList';
import EnrollEmployeeBio from './DTR/EnrollEmployeeBio';
import DTRShifts from './DTR/DTRShifts';
import DTRHolidays from './DTR/DTRHolidays';
import DTREmployee_cdo from './DTR/DTREmployee_cdo';
// Note: Embedded/Modal components (not separate menu items):
// - RawLogsView_Management, ShiftSchedView_Management are in TimeLogsManagement
// - RawLogsView_Dtr, MyShiftView are in DtrChecker
// - EmployeeForm is a modal within EmployeeManagement
// - GenerateDTRPrint_Ind, GenerateDTRPrint_Dept are modals within GenerateDTRReport

// 201 Files Module Components
import EmployeesTabs from './201/EmployeesTabs';
import EmployeeLeaves from './201/201EmployeeLeaves';
import EmployeeLocator201 from './201/201EmployeeLocator';
import EmployeeTravel201 from './201/201EmployeeTravel';

// Payroll Module Components
import PayrollDashboard from './Payroll/PayrollDashboard';
import PayrollProcessing from './Payroll/PayrollProcessing';
import PayrollReports from './Payroll/PayrollReports';

// Shared System Components
import CompanyInfo from './CompanyInfo';
import Departments from './Departments';
import MachineManagement from './MachineManagement';
import UploadEmployee from './UploadEmployee';
import DownloadEmployee from './DownloadEmployee';
import EnvManagement from './EnvManagement';
import DB_201Files from './DB_201Files';
import DB_Payroll from './DB_Payroll';
import MediaStorage from './MediaStorage';
import SysUser from './SysUser';

const HRISManagement = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { can, canAccessPage, hasComponentGroupAccess } = usePermissions();
  
  // State Management
  const [activeModule, setActiveModule] = useState('dtr');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Module expansion states
  const [dtrMenuExpanded, setDtrMenuExpanded] = useState(false);
  const [files201Expanded, setFiles201Expanded] = useState(false);
  const [payrollExpanded, setPayrollExpanded] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [dtrReportsExpanded, setDtrReportsExpanded] = useState(false);
  const [systemExpanded, setSystemExpanded] = useState(false);
  
  // User dropdown
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordData, setChangePasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  
  // Photo upload
  const [showChangePhotoModal, setShowChangePhotoModal] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUploadLoading, setPhotoUploadLoading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [linkingPortal, setLinkingPortal] = useState(false);
  const handleOpenMyDtr = async () => {
    try {
      setLinkingPortal(true);
      const response = await api.post('/auth/admin/portal-session');
      if (!response.data?.token || !response.data?.user) {
        throw new Error('Portal session data is incomplete.');
      }

      const portalUser = { ...response.data.user };
      if (portalUser.USERID !== undefined && portalUser.id === undefined) {
        portalUser.id = portalUser.USERID;
      }

      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('authUser', JSON.stringify(portalUser));
      api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      window.dispatchEvent(new Event('authUpdate'));

      setUserDropdownOpen(false);
      navigate('/dtr-checker');
    } catch (error) {
      console.error('Unable to open My DTR via portal session:', error);
      const message = error.response?.data?.message || 'Unable to open My DTR. Please ensure this admin has a linked portal account.';
      alert(message);
    } finally {
      setLinkingPortal(false);
    }
  };
  
  // Restore navigation state on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hrisNavState') || '{}');
      if (saved.activeModule) setActiveModule(saved.activeModule);
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (typeof saved.activeSubTab === 'string') {
        setActiveSubTab(saved.activeSubTab === 'employee-locator' ? 'employee-management' : saved.activeSubTab);
      }
      if (typeof saved.sidebarOpen === 'boolean') setSidebarOpen(saved.sidebarOpen);
      if (typeof saved.dtrMenuExpanded === 'boolean') setDtrMenuExpanded(saved.dtrMenuExpanded);
      if (typeof saved.files201Expanded === 'boolean') setFiles201Expanded(saved.files201Expanded);
      if (typeof saved.payrollExpanded === 'boolean') setPayrollExpanded(saved.payrollExpanded);
      if (typeof saved.reportsExpanded === 'boolean') setReportsExpanded(saved.reportsExpanded);
      if (typeof saved.dtrReportsExpanded === 'boolean') setDtrReportsExpanded(saved.dtrReportsExpanded);
      if (typeof saved.systemExpanded === 'boolean') setSystemExpanded(saved.systemExpanded);
    } catch {}
  }, []);

  // Persist navigation state on change
  useEffect(() => {
    const state = {
      activeModule,
      activeTab,
      activeSubTab,
      sidebarOpen,
      dtrMenuExpanded,
      files201Expanded,
      payrollExpanded,
      reportsExpanded,
      dtrReportsExpanded,
      systemExpanded,
    };
    try {
      localStorage.setItem('hrisNavState', JSON.stringify(state));
    } catch {}
  }, [activeModule, activeTab, activeSubTab, sidebarOpen, dtrMenuExpanded, files201Expanded, payrollExpanded, reportsExpanded, dtrReportsExpanded, systemExpanded]);
  
  // Company branding
  const [companyData, setCompanyData] = useState({
    lguDtrName: 'HRIS Management System',
    lguName: 'Organization Name',
    lguType: 'Management Portal',
    logoPreview: null
  });
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    totalDepartments: 0,
    todayTimeLogs: 0,
    activeLocators: 0,
    inactiveEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    onTravel: 0,
    onLocator: 0
  });

  // Fetch company information
  const fetchCompanyInfo = async () => {
    try {
      const response = await api.get('/company/info');
      if (response.data.success) {
        setCompanyData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/management/dashboard');
      setDashboardStats(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchCompanyInfo();
    fetchDashboardData();
  }, []);

  // Handle module click
  const handleModuleClick = (moduleId) => {
    setActiveModule(moduleId);
    setActiveTab(`${moduleId}-dashboard`);
    setActiveSubTab('');
    
    // Reset all expansion states
    setDtrMenuExpanded(moduleId === 'dtr');
    setFiles201Expanded(moduleId === '201');
    setPayrollExpanded(moduleId === 'payroll');
    setReportsExpanded(moduleId === 'reports');
    setSystemExpanded(false);
  };

  // Handle tab click
  const handleTabClick = (tabId, hasSubMenu = false) => {
    if (tabId === 'dtr-menu') {
      setActiveModule('dtr');
      setActiveTab('dtr-menu');
      setDtrMenuExpanded(!dtrMenuExpanded);
      return;
    }

    setActiveTab(tabId);
    if (!hasSubMenu) {
      setActiveSubTab('');
    } else     if (tabId === 'DTR-Reports') {
      setDtrReportsExpanded(!dtrReportsExpanded);
      return;
    }
    if (tabId === 'system-setup') {
      setSystemExpanded(!systemExpanded);
    }
  };

  const handleDtrSubTabClick = useCallback((subTabId) => {
    setActiveModule('dtr');
    setActiveTab('dtr-menu');
    setActiveSubTab(subTabId);
    setDtrMenuExpanded(true);
  }, []);

  // Photo upload handler
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setPhotoUploadError('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setPhotoUploadError('File size must be less than 5MB');
        return;
      }
      setPhotoFile(file);
      setPhotoUploadError('');
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoFile) {
      setPhotoUploadError('Please select a photo');
      return;
    }

    try {
      setPhotoUploadLoading(true);
      setPhotoUploadError('');

      const formData = new FormData();
      formData.append('photo', photoFile);

      const response = await api.post('/auth/upload-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        // Update user in localStorage and context
        const updatedUser = { ...user, PHOTO: response.data.photo };
        localStorage.setItem('authUser', JSON.stringify(updatedUser));
        
        // Trigger auth update event to reload user data
        window.dispatchEvent(new Event('authUpdate'));
        
        setShowChangePhotoModal(false);
        setPhotoPreview(null);
        setPhotoFile(null);
        setUserDropdownOpen(false);
        alert('Photo uploaded successfully!');
      } else {
        setPhotoUploadError(response.data.message || 'Failed to upload photo');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      setPhotoUploadError(error.response?.data?.message || 'Failed to upload photo');
    } finally {
      setPhotoUploadLoading(false);
    }
  };

  // Change password handler
  const handleChangePassword = async () => {
    if (!changePasswordData.currentPassword || !changePasswordData.newPassword || !changePasswordData.confirmPassword) {
      setChangePasswordError('All fields are required');
      return;
    }

    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      setChangePasswordError('New passwords do not match');
      return;
    }

    if (changePasswordData.newPassword.length < 6) {
      setChangePasswordError('New password must be at least 6 characters long');
      return;
    }

    try {
      setChangePasswordLoading(true);
      setChangePasswordError('');

      const response = await api.post('/auth/change-password', {
        currentPassword: changePasswordData.currentPassword,
        newPassword: changePasswordData.newPassword
      });

      if (response.data.success) {
        setChangePasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setShowChangePasswordModal(false);
        setUserDropdownOpen(false);
        alert('Password changed successfully!');
      } else {
        setChangePasswordError(response.data.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setChangePasswordError(error.response?.data?.message || 'Failed to change password');
    } finally {
      setChangePasswordLoading(false);
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

  // Render active component based on selection
  const renderActiveComponent = () => {
    // If activeTab is DTR-Reports, use activeSubTab as componentId
    // Otherwise, use activeSubTab if available, else activeTab
    const componentId = activeTab === 'DTR-Reports' 
      ? (activeSubTab || 'DTR-Reports')
      : (activeSubTab || activeTab);
    
    // DTR Module Components
    if (componentId === 'manage-checktime') return <DTRManageChecktimeTabs />;
    if (componentId === 'compute-attendance') return <ComputeAttendance />;
    if (componentId === 'dtr-shifts' || componentId === 'dtr-assign-shift') {
      const canViewShifts = canAccessPage('dtr-shifts');
      const canAssignShift = canAccessPage('dtr-assign-shift');
      return (
        <DTRShifts
          canViewShifts={canViewShifts}
          canAssignShift={canAssignShift}
          initialTab={componentId === 'dtr-assign-shift' ? 'assign' : 'shifts'}
        />
      );
    }
    if (componentId === 'dtr-holidays') return <DTRHolidays />;
    if (componentId === 'dtr-checker-kiosk') return <DtrCheckerKiosk />;
    // Handle DTR-Reports submenu - generate-dtr is under DTR-Reports
    if (componentId === 'generate-dtr' || (activeTab === 'DTR-Reports' && activeSubTab === 'generate-dtr')) return <GenerateDTRReport />;
    if (componentId === 'compute-attendance-report' || componentId === 'computed-attendances' || (activeTab === 'DTR-Reports' && (activeSubTab === 'compute-attendance-report' || activeSubTab === 'computed-attendances'))) return <ComputedAttendanceReport />;
    if (componentId === 'print-locator-entries') return <PrintLocatorEntries />;
    if (componentId === 'dtr-cdo') return <DTREmployee_cdo />;
    
    // Portal Users component (under DTR parent menu)
    if (componentId === 'portal-users') return <DTRPortalUsersTabs />;
    if (componentId === 'enroll-bio') return <EnrollEmployeeBio />;
    if (componentId === 'print-employee-list') return <PrintEmployeeList />;
    
    // 201 Files Module - Placeholder
    if (componentId === '201-dashboard') return <Files201Dashboard />;
    if (
      componentId === '201-employees' ||
      componentId === '201-pds' ||
      componentId === '201-designation'
    ) {
      const canEmployees =
        can('201-employees-with-pds', 'read') || can('201-employees', 'read');
      const canPds = can('201-pds', 'read');
      const canDesignation = can('201-designation', 'read');
      const initialTabMap = {
        '201-employees': 'employees',
        '201-pds': 'pds',
        '201-designation': 'designation'
      };
      return (
        <EmployeesTabs
          initialTab={initialTabMap[componentId] || 'employees'}
          canViewEmployees={canEmployees}
          canViewPds={canPds}
          canViewDesignation={canDesignation}
        />
      );
    }
    if (componentId === '201-leave') return <EmployeeLeaves />;
    if (componentId === '201-locator') return <EmployeeLocator201 />;
    if (componentId === '201-travel') return <EmployeeTravel201 />;
    // Payroll Module Components
    if (componentId === 'payroll-dashboard') return <PayrollDashboard />;
    if (componentId === 'payroll-processing') return <PayrollProcessing />;
    if (componentId === 'payroll-reports') return <PayrollReports />;
    
    // System Components
    if (componentId === 'company-info') return <CompanyInfo />;
    if (componentId === 'departments') return <Departments />;
    if (componentId === 'machine-management') return <MachineManagement />;
    if (componentId === 'upload-employee') return <UploadEmployee />;
    if (componentId === 'download-employee') return <DownloadEmployee />;
    if (componentId === 'db-connection') return <EnvManagement />;
    if (componentId === 'db-201files') return <DB_201Files />;
    if (componentId === 'db-payroll') return <DB_Payroll />;
    if (componentId === 'media-storage') return <MediaStorage />;
    if (componentId === 'sys-users') return <SysUser />;
    
    // Default: Dashboard
    return <DashboardTab stats={dashboardStats} activeModule={activeModule} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-gradient-to-b from-slate-50 to-white shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Sidebar Header */}
        <div className="relative h-20 px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-black bg-opacity-10"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white bg-opacity-5 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white bg-opacity-5 rounded-full translate-y-12 -translate-x-12"></div>
          
          <div className="relative flex items-center justify-between h-full">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 flex items-center justify-center">
                {companyData.logoPreview ? (
                  <img
                    src={companyData.logoPreview}
                    alt="Company Logo"
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{companyData.lguDtrName}</h1>
                <p className="text-sm text-indigo-100 font-medium">{companyData.lguName}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-xl hover:bg-white hover:bg-opacity-20 transition-all duration-200 backdrop-blur-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Module Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* DTR Parent Menu - Only show if user has components in 'DTR' group */}
          {hasComponentGroupAccess('DTR') && (
            <div>
              <button
                onClick={() => handleTabClick('dtr-menu', true)}
                className={`w-full flex items-center px-3 py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                  activeTab === 'dtr-menu'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl mr-3">🕐</span>
                <span className="flex-1 text-left">DTR</span>
                <svg 
                  className={`w-4 h-4 transition-transform duration-200 ${dtrMenuExpanded ? 'rotate-90' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              
              {dtrMenuExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {canAccessPage('portal-users') && (
                    <button
                      onClick={() => handleDtrSubTabClick('portal-users')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'portal-users'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">👤</span>
                      <span className="flex-1 text-left">Portal Users</span>
                    </button>
                  )}
                  {canAccessPage('manage-checktime') && (
                    <button
                      onClick={() => handleDtrSubTabClick('manage-checktime')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'manage-checktime'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">⏰</span>
                      <span className="flex-1 text-left">Manage Checktime</span>
                    </button>
                  )}
                  {canAccessPage('dtr-cdo') && (
                    <button
                      onClick={() => handleDtrSubTabClick('dtr-cdo')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'dtr-cdo'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">📝</span>
                      <span className="flex-1 text-left">CDO</span>
                    </button>
                  )}
                  {canAccessPage('201-locator') && (
                    <button
                      onClick={() => handleDtrSubTabClick('201-locator')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === '201-locator'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">📍</span>
                      <span className="flex-1 text-left">Locator</span>
                    </button>
                  )}
                  {canAccessPage('dtr-holidays') && (
                    <button
                      onClick={() => handleDtrSubTabClick('dtr-holidays')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'dtr-holidays'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">🎉</span>
                      <span className="flex-1 text-left">Holiday</span>
                    </button>
                  )}
                  {(canAccessPage('dtr-shifts') || canAccessPage('dtr-assign-shift')) && (
                    <button
                      onClick={() => handleDtrSubTabClick('dtr-shifts')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'dtr-shifts' || activeSubTab === 'dtr-assign-shift'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">⏰</span>
                      <span className="flex-1 text-left">Shifts</span>
                    </button>
                  )}
                  {canAccessPage('departments') && (
                    <button
                      onClick={() => handleDtrSubTabClick('departments')}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${
                        activeSubTab === 'departments'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">🏛️</span>
                      <span className="flex-1 text-left">Departments</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 201 Files Module - Only show if user has components in '201 Files' group */}
          {hasComponentGroupAccess('201 Files') && (
          <div>
            <button
              onClick={() => handleModuleClick('201')}
              className={`w-full flex items-center px-3 py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                activeModule === '201'
                  ? 'bg-green-100 text-green-700 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl mr-3">📁</span>
              <span className="flex-1 text-left">201 Files</span>
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${files201Expanded ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {/* 201 Files Submenu */}
            {files201Expanded && (
              <div className="ml-6 mt-1 space-y-1">
                {canAccessPage('201-dashboard') && (
                <button onClick={() => { setActiveTab('201-dashboard'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === '201-dashboard' ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📊</span>
                  <span className="flex-1 text-left">Dashboard</span>
                </button>
                )}
                {canAccessPage('201-employees') && (
                <button onClick={() => { setActiveTab('201-employees'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === '201-employees' ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">👥</span>
                  <span className="flex-1 text-left">Employees</span>
                </button>
                )}
                {canAccessPage('201-leave') && (
                <button onClick={() => { setActiveTab('201-leave'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === '201-leave' ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">🏖️</span>
                  <span className="flex-1 text-left">Manage Leaves</span>
                </button>
                )}
                {canAccessPage('201-travel') && (
                  <button onClick={() => { setActiveTab('201-travel'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === '201-travel' ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="mr-2">🧳</span>
                    <span className="flex-1 text-left">Travel</span>
                  </button>
                )}
              </div>
            )}
          </div>
          )}

          {/* Payroll Module - Only show if user has components in 'Payroll' group */}
          {hasComponentGroupAccess('Payroll') && (
          <div>
            <button
              onClick={() => handleModuleClick('payroll')}
              className={`w-full flex items-center px-3 py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                activeModule === 'payroll'
                  ? 'bg-purple-100 text-purple-700 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl mr-3 font-bold" style={{ color: '#1e40af' }}>₱</span>
              <span className="flex-1 text-left">Payroll</span>
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${payrollExpanded ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {/* Payroll Submenu */}
            {payrollExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {canAccessPage('payroll-dashboard') && (
                <button onClick={() => { setActiveTab('payroll-dashboard'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === 'payroll-dashboard' ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📊</span>
                  <span className="flex-1 text-left">Dashboard</span>
                </button>
                )}
                {canAccessPage('payroll-processing') && (
                <button onClick={() => { setActiveTab('payroll-processing'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === 'payroll-processing' ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">💳</span>
                  <span className="flex-1 text-left">Payroll Processing</span>
                </button>
                )}
                {canAccessPage('payroll-reports') && (
                <button onClick={() => { setActiveTab('payroll-reports'); setActiveSubTab(''); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === 'payroll-reports' ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📄</span>
                  <span className="flex-1 text-left">Reports</span>
                </button>
                )}
              </div>
            )}
          </div>
          )}

          {/* Reports Module - Only show if user has components in 'Reports' group */}
          {hasComponentGroupAccess('Reports') && (
          <div>
            <button
              onClick={() => handleModuleClick('reports')}
              className={`w-full flex items-center px-3 py-3 text-sm font-bold rounded-lg transition-all duration-200 ${
                activeModule === 'reports'
                  ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl mr-3">📈</span>
              <span className="flex-1 text-left">Reports</span>
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${reportsExpanded ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {reportsExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {/* DTR Submenu */}
                <button
                  onClick={() => handleTabClick('DTR-Reports', true)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${activeTab === 'DTR-Reports' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span className="mr-2">📋</span>
                  <span className="flex-1 text-left">DTR</span>
                  <svg 
                    className={`w-3 h-3 transition-transform duration-200 ${dtrReportsExpanded ? 'rotate-90' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                {dtrReportsExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {canAccessPage('generate-dtr') && (
                    <button onClick={() => { setActiveTab('DTR-Reports'); setActiveSubTab('generate-dtr'); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeSubTab === 'generate-dtr' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📝</span>
                  <span className="flex-1 text-left">Generate DTR</span>
                </button>
                )}
                {(canAccessPage('compute-attendance-report') || canAccessPage('computed-attendances')) && (
                    <button onClick={() => { setActiveTab('DTR-Reports'); setActiveSubTab('compute-attendance-report'); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeSubTab === 'compute-attendance-report' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📊</span>
                  <span className="flex-1 text-left">Computed Attendances</span>
                </button>
                )}
                  </div>
                )}
                
                {canAccessPage('print-employee-list') && (
                <button onClick={() => { setActiveTab('print-employee-list'); setActiveSubTab('print-employee-list'); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === 'print-employee-list' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">🧾</span>
                  <span className="flex-1 text-left">Employee List</span>
                </button>
                )}
                {canAccessPage('print-locator-entries') && (
                <button onClick={() => { setActiveTab('print-locator-entries'); setActiveSubTab('print-locator-entries'); }} className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-200 ${activeTab === 'print-locator-entries' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className="mr-2">📍</span>
                  <span className="flex-1 text-left">Locator Entries</span>
                </button>
                )}
              </div>
            )}
          </div>
          )}

          {/* System Setup Section - Only show if user has components in 'System Setup' group */}
          {hasComponentGroupAccess('System Setup') && (
          <div className="pt-4 border-t border-gray-200 mt-4">
            <button
              onClick={() => handleTabClick('system-setup', true)}
              className="w-full flex items-center px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-md"
            >
              <span className="mr-2">🔧</span>
              <span className="flex-1 text-left">System Setup</span>
              <svg 
                className={`w-3 h-3 transition-transform duration-200 ${systemExpanded ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            {systemExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {canAccessPage('company-info') && (
                <button onClick={() => { setActiveTab('company-info'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">🏢</span>
                  <span className="flex-1 text-left">Company Info</span>
                </button>
                )}
                {canAccessPage('machine-management') && (
                <button onClick={() => { setActiveTab('machine-management'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">🖥️</span>
                  <span className="flex-1 text-left">Machine Management</span>
                </button>
                )}
                {canAccessPage('upload-employee') && (
                <button onClick={() => { setActiveTab('upload-employee'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">⬆️</span>
                  <span className="flex-1 text-left">Upload Employee</span>
                </button>
                )}
                {canAccessPage('enroll-bio') && (
                <button onClick={() => { setActiveTab('enroll-bio'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">🖐️</span>
                  <span className="flex-1 text-left">Enroll Biometric</span>
                </button>
                )}
                {canAccessPage('download-employee') && (
                <button onClick={() => { setActiveTab('download-employee'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">⬇️</span>
                  <span className="flex-1 text-left">Download Employee</span>
                </button>
                )}
                {canAccessPage('db-connection') && (
                <button onClick={() => { setActiveTab('db-connection'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">🔌</span>
                  <span className="flex-1 text-left">DB Connection (Main)</span>
                </button>
                )}
                {canAccessPage('db-201files') && (
                <button onClick={() => { setActiveTab('db-201files'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">📁</span>
                  <span className="flex-1 text-left">DB 201 Files</span>
                </button>
                )}
                {canAccessPage('db-payroll') && (
                <button onClick={() => { setActiveTab('db-payroll'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">💰</span>
                  <span className="flex-1 text-left">DB Payroll</span>
                </button>
                )}
                {canAccessPage('media-storage') && (
                <button onClick={() => { setActiveTab('media-storage'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                  <span className="mr-2">📁</span>
                  <span className="flex-1 text-left">Media Storage</span>
                </button>
                )}
                {canAccessPage('sys-users') && (
                  <button onClick={() => { setActiveTab('sys-users'); setActiveSubTab(''); }} className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-600 hover:bg-gray-50">
                    <span className="mr-2">👤</span>
                    <span className="flex-1 text-left">System Users</span>
                  </button>
                )}
              </div>
            )}
          </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-gray-200 bg-white">
          <div className="text-center text-xs text-gray-500">
            <p className="font-semibold">HRIS System v1.25</p>
            <p>© 2025 All Rights Reserved</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-80' : 'ml-0'}`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {activeModule === 'dtr' && '🕐 DTR Management'}
                  {activeModule === '201' && '📁 201 Files'}
                  {activeModule === 'payroll' && <span><span style={{ color: '#1e40af', fontWeight: 'bold' }}>₱</span> Payroll</span>}
                  {activeModule === 'reports' && '📈 Reports'}
                </h2>
                <p className="text-sm text-gray-500">
                  {(activeSubTab || activeTab).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </p>
              </div>
            </div>
            
            {/* User Dropdown */}
            <div className="relative user-dropdown">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
              >
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {user?.NAME || user?.name || 'Administrator'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {user?.TITLE || user?.title || 'System Administrator'}
                  </div>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md overflow-hidden relative">
                  {(() => {
                    // Admin users always use sysusers.photo (stored as PNG format)
                    // Photos from backend are already in data:image/png;base64,... format
                    let photoSrc = null;
                    const photoValue = user?.PHOTO;
                    
                    if (photoValue) {
                      if (typeof photoValue === 'string') {
                        // Already a string
                        if (photoValue.startsWith('data:')) {
                          photoSrc = photoValue;
                        } else {
                          // Base64 string without data URL prefix
                          photoSrc = user?.role === 'admin' 
                            ? `data:image/png;base64,${photoValue}` 
                            : `data:image/jpeg;base64,${photoValue}`;
                        }
                      } else if (typeof photoValue === 'object' && photoValue !== null) {
                        // If PHOTO is an object, try to extract base64 or convert it
                        // Try to get base64 from object properties
                        const base64String = photoValue.base64 || photoValue.data || (typeof photoValue.toString === 'function' ? photoValue.toString() : null);
                        if (base64String && typeof base64String === 'string') {
                          photoSrc = base64String.startsWith('data:') 
                            ? base64String 
                            : `data:image/png;base64,${base64String}`;
                        }
                      }
                    }
                    
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
                <svg 
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`}
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
                    onClick={handleOpenMyDtr}
                    disabled={linkingPortal}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center space-x-2 ${
                      linkingPortal ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>{linkingPortal ? 'Opening...' : 'My DTR'}</span>
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      setShowChangePhotoModal(true);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Change Photo</span>
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      setShowChangePasswordModal(true);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" />
                    </svg>
                    <span>Change Password</span>
                  </button>
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
        </header>

        {/* Page Content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {renderActiveComponent()}
          </div>
        </main>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordError('');
                  setChangePasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {changePasswordError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {changePasswordError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={changePasswordData.currentPassword}
                  onChange={(e) => setChangePasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter current password"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={changePasswordData.newPassword}
                  onChange={(e) => setChangePasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new password"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={changePasswordData.confirmPassword}
                  onChange={(e) => setChangePasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleChangePassword}
                disabled={changePasswordLoading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changePasswordLoading ? 'Changing...' : 'Change Password'}
              </button>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordError('');
                  setChangePasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  });
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Photo Modal */}
      {showChangePhotoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Change Photo</h3>
              <button
                onClick={() => {
                  setShowChangePhotoModal(false);
                  setPhotoUploadError('');
                  setPhotoPreview(null);
                  setPhotoFile(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {photoUploadError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {photoUploadError}
              </div>
            )}

            <div className="space-y-4">
              {/* Current Photo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Photo
                </label>
                <div className="flex justify-center">
                  <div className="w-32 h-32 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md overflow-hidden">
                    {user?.PHOTO ? (
                      <img 
                        src={user.PHOTO && typeof user.PHOTO === 'string' && user.PHOTO.startsWith('data:') 
                          ? user.PHOTO 
                          : user?.role === 'admin' 
                            ? `data:image/png;base64,${user.PHOTO}` 
                            : `data:image/jpeg;base64,${user.PHOTO}`} 
                        alt={user?.NAME || user?.name || 'User'} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl">
                        {(user?.NAME || user?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Photo Preview */}
              {photoPreview && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Photo Preview
                  </label>
                  <div className="flex justify-center">
                    <img 
                      src={photoPreview} 
                      alt="Preview" 
                      className="w-32 h-32 object-cover rounded-xl border-2 border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select New Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">JPG, PNG or GIF. Max size 5MB.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleUploadPhoto}
                disabled={photoUploadLoading || !photoFile}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {photoUploadLoading ? 'Uploading...' : 'Upload Photo'}
              </button>
              <button
                onClick={() => {
                  setShowChangePhotoModal(false);
                  setPhotoUploadError('');
                  setPhotoPreview(null);
                  setPhotoFile(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

// Dashboard Tab Component
const DashboardTab = ({ stats, activeModule }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalEmployees}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Employees</p>
              <p className="text-3xl font-bold text-green-600">{stats.activeEmployees}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Departments</p>
              <p className="text-3xl font-bold text-purple-600">{stats.totalDepartments}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </div>
        
        {activeModule === 'dtr' && (
          <>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Today's Time Logs</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.todayTimeLogs}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Locators</p>
                  <p className="text-3xl font-bold text-indigo-600">{stats.activeLocators}</p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Welcome to {activeModule === 'dtr'
            ? 'DTR Management'
            : activeModule === '201'
            ? '201 Files Management'
            : activeModule === 'reports'
            ? 'Reports Center'
            : 'Payroll Management'}
        </h3>
        <p className="text-gray-600">
          Select an option from the left sidebar to get started managing your {activeModule === 'dtr' ? 'daily time records and attendance' : activeModule === '201' ? 'employee files and records' : activeModule === 'reports' ? 'reports and analytics' : 'payroll processing and reports'}.
        </p>
      </div>
    </div>
  );
};

// 201 Files Dashboard - Placeholder Component
const Files201Dashboard = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg shadow-lg p-8 text-white">
        <h2 className="text-3xl font-bold mb-2">📁 201 Files Module</h2>
        <p className="text-green-100">Employee Personnel Records Management</p>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="text-lg font-semibold text-yellow-800 mb-2">Module Under Development</h4>
            <p className="text-sm text-yellow-700 mb-4">
              The 201 Files module is currently under development. This module will be dedicated to comprehensive employee personnel file management.
            </p>
            <p className="text-sm text-yellow-700 mb-3">
              <strong>Note:</strong> Employee management features are currently available under the <strong>DTR Management → Employee Records</strong> section.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Planned Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Document Management</h4>
              <p className="text-sm text-gray-600">Digital storage and management of employee documents, certificates, and credentials</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Personal Data Sheets</h4>
              <p className="text-sm text-gray-600">Complete employee personal information, education, work history, and eligibility</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Compliance Documents</h4>
              <p className="text-sm text-gray-600">NBI clearance, medical certificates, government IDs, and mandatory requirements</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Training & Development</h4>
              <p className="text-sm text-gray-600">Training records, seminars attended, certifications, and professional development</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Performance Records</h4>
              <p className="text-sm text-gray-600">Performance evaluations, IPCR/OPCR ratings, awards, and recognitions</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Service Records</h4>
              <p className="text-sm text-gray-600">Complete employment history, position changes, promotions, and service milestones</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              <strong>Current Access:</strong> Basic employee management features are available under DTR Management → Employee Records until this dedicated module is completed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRISManagement;

