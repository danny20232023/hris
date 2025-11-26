import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import { getAppointmentOptions, getAppointmentName } from '../../utils/appointmentLookup';

function DTRPortalFormModal({ employeeId, onSuccess, isModal = false, portalUserMode = false }) {
  const { id: urlId } = useParams(); // Get ID from URL params
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [existingPhoto, setExistingPhoto] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [availableShiftSchedules, setAvailableShiftSchedules] = useState([]);
  
  // Updated formData - removed USERID since it's auto-generated
  const [formData, setFormData] = useState({
    // Required fields for new employee (only 3 now)
    BADGENUMBER: '', // Inputted BADGE NUMBER
    SSN: '', // Inputted SSN
    NAME: '', // Inputted FULL NAME
    GENDER: '', // Selected GENDER
    TITLE: '', // Inputted POSITION OR JOB TITLE
    BIRTHDAY: '', // Selected DATE OF BIRTHDATE OR NULL
    HIREDDAY: '', // Selected HIRE DATE OR NULL
    STREET: '', // Inputted ADDRESS OR either NULL
    DEFAULTDEPTID: '', // SELECTED DEPT or either NULL
    privilege: 0, // selected privilege or set to 0
    Appointment: '', // selected appointment or either NULL
    InheritDeptSchClass: '', // shift schedule selection
    status: 'Activate', // For portal user mode: Status radio button (Activate/Deactivate)
    
    // Fields that will be set to default values (not shown in form)
    PAGER: null,
    CITY: null,
    STATE: null,
    ZIP: null,
    OPHONE: null,
    FPHONE: null,
    VERIFICATIONMETHOD: 1,
    SECURITYFLAGS: null,
    ATT: 1,
    INLATE: 0,
    OUTEARLY: 0,
    OVERTIME: 1,
    SEP: 1,
    HOLIDAY: 1,
    MINZU: null,
    PASSWORD: null,
    LUNCHDURATION: 1,
    MVerifyPass: null,
    Notes: null,
    InheritDeptSch: 1,
    AutoSchPlan: 1,
    MinAutoSchInterval: 24,
    RegisterOT: 1,
    InheritDeptRule: 0,
    EMPRIVILEGE: 0,
    CardNo: null,
    FaceGroup: 0,
    AccGroup: 1,
    UseAccGroupTZ: 1,
    VerifyCode: 0,
    Expires: 0,
    ValidCount: 0,
    ValidTimeBegin: null,
    ValidTimeEnd: null,
    TimeZone1: 1,
    TimeZone2: 0,
    TimeZone3: 0
  });

  // Add state to track original values for comparison
  const [originalData, setOriginalData] = useState({});

  // Add state to track original privilege value for comparison
  const [originalPrivilege, setOriginalPrivilege] = useState(null);

  // Add state for countdown
  const [countdown, setCountdown] = useState(4);

  // Add state for error popup
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  // Determine which ID to use (props for modal, URL params for full page)
  const currentId = employeeId || urlId;

  // Fetch departments on component mount
  useEffect(() => {
    fetchDepartments();
    fetchShiftSchedules(); // Add this back
  }, []);

  // Fetch employee data if editing
  useEffect(() => {
    if (currentId && currentId !== 'new') {
      fetchEmployeeData();
    }
  }, [currentId]);

  // Add countdown effect when popup is shown
  useEffect(() => {
    if (showSuccessPopup) {
      setCountdown(4);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [showSuccessPopup]);

  // Function to compare original data with current form data to determine what was updated
  const getUpdatedFields = () => {
    const updated = [];
    
    // Define field labels for display
    const fieldLabels = {
      NAME: 'Name',
      BADGENUMBER: 'Badge Number',
      SSN: 'SSN',
      DEFAULTDEPTID: 'Department',
      TITLE: 'Position/Title',
      GENDER: 'Gender',
      BIRTHDAY: 'Birthday',
      HIREDDAY: 'Hire Date',
      STREET: 'Address',
      privilege: 'Employment Status',
      PASSWORD: 'Password',
      Appointment: 'Appointment Type',
      InheritDeptSchClass: 'Shift Schedule'
    };

    // For new employees, show all filled fields
    if (currentId === 'new' || !currentId) {
      Object.keys(formData).forEach(key => {
        if (formData[key] && formData[key] !== '' && key !== 'employmentStatus') {
          const fieldName = fieldLabels[key] || key;
          const fieldValue = formatFieldValue(key, formData[key]);
          updated.push({ name: fieldName, value: fieldValue });
        }
      });
      
      // Check if photo was added
      if (photoFile) {
        updated.push({ name: 'Photo', value: 'Updated' });
      }
    } else {
      // For existing employees, check for actual changes
      Object.keys(formData).forEach(key => {
        if (key === 'PASSWORD' && formData[key] && formData[key].trim() !== '') {
          // Password was changed if it has a value
          updated.push({ name: fieldLabels[key] || key, value: 'Updated' });
        } else if (key === 'privilege') {
          // Handle privilege comparison more carefully
          const originalPriv = originalData[key] || 0;
          const currentPriv = formData[key] || 0;
          if (originalPriv != currentPriv) {
            const fieldValue = formatFieldValue(key, formData[key]);
            updated.push({ name: fieldLabels[key] || key, value: fieldValue });
          }
        } else if (key === 'employmentStatus') {
          // Skip employmentStatus as it's not a real field
          return;
        } else if (originalData[key] !== formData[key]) {
          // Only add if the value actually changed and is not empty
          if (formData[key] !== '' && formData[key] !== null && formData[key] !== undefined) {
            const fieldName = fieldLabels[key] || key;
            const fieldValue = formatFieldValue(key, formData[key]);
            updated.push({ name: fieldName, value: fieldValue });
          }
        }
      });

      // Check if photo was updated
      if (photoFile) {
        updated.push({ name: 'Photo', value: 'Updated' });
      }
    }

    console.log('Updated fields:', updated);
    console.log('Original data:', originalData);
    console.log('Current form data:', formData);
    console.log('Is new employee:', currentId === 'new' || !currentId);

    return updated;
  };

  // Function to get department name by ID
  const getDepartmentName = (deptId) => {
    const department = departments.find(dept => dept.DEPTID === deptId);
    return department ? department.DEPTNAME : 'Unknown Department';
  };

  // Function to get appointment name by ID
  const getAppointmentDisplayName = (appointmentId) => {
    return getAppointmentName(appointmentId);
  };

  // Function to get shift schedule name by ID
  const getShiftScheduleName = (shiftId) => {
    const schedule = availableShiftSchedules.find(s => s.SHIFTNO === shiftId);
    return schedule ? schedule.SHIFTNAME : 'No Schedule';
  };

  // Function to format field values for display
  const formatFieldValue = (field, value) => {
    switch (field) {
      case 'DEFAULTDEPTID':
        return getDepartmentName(value);
      case 'Appointment':
        return getAppointmentDisplayName(value);
      case 'InheritDeptSchClass':
        return getShiftScheduleName(value);
      case 'privilege':
        return value >= 0 ? 'Active' : 'Inactive';
      case 'BIRTHDAY':
      case 'HIREDDAY':
        return value ? new Date(value).toLocaleDateString() : 'Not set';
      case 'GENDER':
        return value === 'M' ? 'Male' : value === 'F' ? 'Female' : value;
      case 'PASSWORD':
        return 'Updated';
      default:
        return value || 'Not set';
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/employees/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  // Add validation function for USERID and BADGENUMBER
  // const validateUniqueFields = async (userId, badgeNumber, currentUserId = null) => {
  //   try {
  //     const response = await api.get('/employees/validate-unique', {
  //       params: {
  //         userId,
  //         badgeNumber,
  //         currentUserId
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error validating unique fields:', error);
  //     return { isValid: false, errors: {} };
  //   }
  // };

  // Add handler for USERID input with validation
  // const handleUserIdChange = async (e) => {
  //   const { value } = e.target;
  //   setFormData(prev => ({
  //     ...prev,
  //     USERID: value
  //   }));

  //   // Clear previous validation errors for USERID
  //   setValidationErrors(prev => ({
  //     ...prev,
  //     USERID: ''
  //   }));

  //   // Validate if not empty and not editing existing user
  //   if (value && (!currentId || currentId === 'new')) {
  //     const validation = await validateUniqueFields(value, formData.BADGENUMBER, currentId);
  //     if (!validation.isValid) {
  //       setValidationErrors(prev => ({
  //         ...prev,
  //         USERID: validation.errors.userId || 'User ID already exists'
  //       }));
  //     }
  //   }
  // };

  // Add handler for BADGENUMBER input with 5-digit validation
  const handleBadgeNumberChange = async (e) => {
    const { value } = e.target;
    
    // Only allow digits and limit to 5 characters
    const numericValue = value.replace(/\D/g, '').slice(0, 5);
    
    setFormData(prev => ({
      ...prev,
      BADGENUMBER: numericValue
    }));

    // Clear previous validation errors for BADGENUMBER
    setValidationErrors(prev => ({
      ...prev,
      BADGENUMBER: ''
    }));

    // Validate BADGENUMBER uniqueness if not empty and not editing existing user
    if (numericValue && (!currentId || currentId === 'new')) {
      try {
        const response = await api.get('/employees/validate-unique', {
          params: {
            badgeNumber: numericValue,
            currentUserId: currentId
          }
        });
        
        if (!response.data.isValid) {
          setValidationErrors(prev => ({
            ...prev,
            BADGENUMBER: response.data.errors.badgeNumber || 'Badge Number already exists'
          }));
        }
      } catch (error) {
        console.error('Error validating badge number:', error);
      }
    }
  };

  const fetchEmployeeData = async () => {
    if (!currentId || currentId === 'new') return;
    
    setLoading(true);
    try {
      const response = await api.get(`/employees/${currentId}`);
      const employee = response.data;
      
      setFormData({
        BADGENUMBER: employee.BADGENUMBER || '',
        SSN: employee.SSN || '',
        NAME: employee.NAME || '',
        DEFAULTDEPTID: employee.DEFAULTDEPTID || '',
        TITLE: employee.TITLE || '',
        GENDER: employee.GENDER || '',
        BIRTHDAY: employee.BIRTHDAY ? employee.BIRTHDAY.split('T')[0] : '',
        HIREDDAY: employee.HIREDDAY ? employee.HIREDDAY.split('T')[0] : '',
        STREET: employee.STREET || '',
        privilege: employee.privilege || '',
        employmentStatus: employee.privilege >= 0 ? 'Active' : 'Inactive', // Set based on privilege
        status: employee.privilege >= 0 ? 'Activate' : 'Deactivate', // For portal user mode
        PASSWORD: employee.PASSWORD || '', // Set decrypted password for super admin
        Appointment: employee.Appointment || '', // Add appointment field
        InheritDeptSchClass: employee.InheritDeptSchClass || '' // Add shift schedule
      });
      
      // Store the original privilege value for comparison
      setOriginalPrivilege(employee.privilege);
      
      // Store original data for comparison
      setOriginalData(employee);
      
      // Load existing photo if available
      if (employee.PHOTO) {
        // Backend already returns photo as a data URL, use it directly
        setExistingPhoto(employee.PHOTO);
      }
      
    } catch (error) {
      console.error('Error fetching employee:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Handle status radio button for portal user mode
    if (name === 'status' && portalUserMode) {
      setFormData(prev => ({
        ...prev,
        status: value,
        privilege: value === 'Deactivate' ? -1 : 0
      }));
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Add a new handler function after the handleInputChange function (around line 96)
  const handleJobTitleChange = (e) => {
    const { name, value } = e.target;
    
    // Allow only letters, spaces, hyphens, apostrophes, periods, parentheses, and common job title characters
    // This regex allows: letters (a-z, A-Z), spaces, hyphens (-), apostrophes ('), periods (.), 
    // parentheses (), forward slashes (/), ampersands (&), and numbers for titles like "Manager II"
    const allowedPattern = /^[a-zA-Z0-9\s\-'.()\/&]*$/;
    
    // Check if the input matches the allowed pattern
    if (allowedPattern.test(value) || value === '') {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    // If the pattern doesn't match, the input is ignored (character not added)
  };

  // Add a new handler function after the handleJobTitleChange function
  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    
    // Allow characters commonly used in addresses:
    // Letters (a-z, A-Z), numbers (0-9), spaces, hyphens (-), apostrophes ('), 
    // periods (.), commas (,), hashtags (#), forward slashes (/), parentheses (),
    // ampersands (&), and other common address characters
    const allowedPattern = /^[a-zA-Z0-9\s\-'.,#\/()&]*$/;
    
    // Check if the input matches the allowed pattern
    if (allowedPattern.test(value) || value === '') {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    // If the pattern doesn't match, the input is ignored (character not added)
  };

  // Function to convert image to BMP format with high quality
  const convertToBMP = (file) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Calculate row padding (BMP rows must be padded to 4-byte boundary)
      const bytesPerPixel = 3; // BGR format
      const rowSize = canvas.width * bytesPerPixel;
      const paddingSize = (4 - (rowSize % 4)) % 4; // Padding to make row size multiple of 4
      const paddedRowSize = rowSize + paddingSize;
      
      // Calculate total image data size
      const imageDataSize = paddedRowSize * canvas.height;
      
      // Create BMP data array (header + image data)
      const bmpData = new Uint8Array(54 + imageDataSize);
      
      // BMP header (54 bytes)
      const header = new ArrayBuffer(54);
      const headerView = new DataView(header);
      
      // File header (14 bytes)
      headerView.setUint8(0, 0x42); // 'B'
      headerView.setUint8(1, 0x4D); // 'M'
      headerView.setUint32(2, 54 + imageDataSize, true); // File size
      headerView.setUint32(6, 0, true); // Reserved
      headerView.setUint32(10, 54, true); // Data offset
      
      // Info header (40 bytes)
      headerView.setUint32(14, 40, true); // Header size
      headerView.setUint32(18, canvas.width, true); // Width
      headerView.setUint32(22, canvas.height, true); // Height
      headerView.setUint16(26, 1, true); // Planes
      headerView.setUint16(28, 24, true); // Bits per pixel
      headerView.setUint32(30, 0, true); // Compression (BI_RGB = 0)
      headerView.setUint32(34, imageDataSize, true); // Image size
      headerView.setUint32(38, 2835, true); // X pixels per meter (72 DPI)
      headerView.setUint32(42, 2835, true); // Y pixels per meter (72 DPI)
      headerView.setUint32(46, 0, true); // Colors used (0 = all colors)
      headerView.setUint32(50, 0, true); // Important colors (0 = all important)
      
      // Copy header to BMP data
      bmpData.set(new Uint8Array(header), 0);
      
      // Convert RGBA to BGR and flip vertically with proper padding
      let bmpIndex = 54;
      for (let y = canvas.height - 1; y >= 0; y--) { // Flip vertically
        for (let x = 0; x < canvas.width; x++) {
          const srcIndex = (y * canvas.width + x) * 4;
          
          // Convert RGBA to BGR (BMP format)
          bmpData[bmpIndex++] = imageData.data[srcIndex + 2]; // B
          bmpData[bmpIndex++] = imageData.data[srcIndex + 1]; // G
          bmpData[bmpIndex++] = imageData.data[srcIndex]; // R
        }
        
        // Add row padding
        for (let p = 0; p < paddingSize; p++) {
          bmpData[bmpIndex++] = 0;
        }
      }
      
      resolve(bmpData);
    };

    img.src = URL.createObjectURL(file);
  });
};


  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (2MB max)
      if (file.size > 2 * 1024 * 1024) {
        showError('File Size Error', 'Photo must be less than 2MB.');
        return;
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('File Type Error', 'Please select a valid image file.');
        return;
      }
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target.result);
      };
      reader.readAsDataURL(file);
      
      // Store the file for upload
      setFormData(prev => ({
        ...prev,
        photo: file
      }));
    }
  };

  const processPhotoFile = async (file) => {
    try {
      // Convert to BMP format
      const bmpData = await convertToBMP(file);
      
      // Create a new file with BMP data
      const bmpFile = new File([bmpData], file.name.replace(/\.[^/.]+$/, '.bmp'), { type: 'image/bmp' });
      
      setPhotoFile(bmpFile);
        
        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
          setPhotoPreview(e.target.result);
        };
      reader.readAsDataURL(bmpFile);
      
      } catch (error) {
      console.error('Error converting to BMP:', error);
      alert('Error converting image to BMP format. Please try again.');
    }
  };

  // Add handler for SSN input with 4-digit validation
  const handleSSNChange = (e) => {
    const { value } = e.target;
    
    // Only allow digits and limit to 4 characters
    const numericValue = value.replace(/\D/g, '').slice(0, 4);
    
    setFormData(prev => ({
      ...prev,
      SSN: numericValue
    }));

    // Clear previous validation errors for SSN
    setValidationErrors(prev => ({
      ...prev,
      SSN: ''
    }));
  };

  // Add handler for NAME input with character limit
  const handleNameChange = (e) => {
    const { value } = e.target;
    
    // Limit to 50 characters
    const limitedValue = value.slice(0, 50);
    
    setFormData(prev => ({
      ...prev,
      NAME: limitedValue
    }));

    // Clear previous validation errors for NAME
    setValidationErrors(prev => ({
      ...prev,
      NAME: ''
    }));
  };

  // Add handler for TITLE input with character limit
  const handleTitleChange = (e) => {
    const { value } = e.target;
    
    // Limit to 30 characters
    const limitedValue = value.slice(0, 30);
    
    setFormData(prev => ({
      ...prev,
      TITLE: limitedValue
    }));
  };

  // Add handler for STREET input with character limit
  const handleStreetChange = (e) => {
    const { value } = e.target;
    
    // Limit to 100 characters
    const limitedValue = value.slice(0, 100);
    
    setFormData(prev => ({
      ...prev,
      STREET: limitedValue
    }));
  };

  // Update validateRequiredFields to check for exactly 5 digits for BADGENUMBER
  const validateRequiredFields = () => {
    const errors = {};
    const missingFields = [];
    
    console.log('=== VALIDATION DEBUG ===');
    console.log('Form data:', formData);
    console.log('Badge Number:', formData.BADGENUMBER, 'Length:', formData.BADGENUMBER?.length);
    console.log('SSN:', formData.SSN, 'Length:', formData.SSN?.length);
    console.log('Name:', formData.NAME);
    console.log('Gender:', formData.GENDER);
    console.log('Department:', formData.DEFAULTDEPTID);
    
    // Validate the 5 required fields for new employees
    if (!formData.BADGENUMBER) {
      errors.BADGENUMBER = 'Badge Number is required';
      missingFields.push('Badge Number');
      console.log('Badge Number validation failed: required');
    } else if (formData.BADGENUMBER.length < 1 || formData.BADGENUMBER.length > 5) {
      errors.BADGENUMBER = 'Badge Number must be 1-5 digits';
      missingFields.push('Badge Number (must be 1-5 digits)');
      console.log('Badge Number validation failed: length');
    }
    
    if (!formData.SSN) {
      errors.SSN = 'SSN/PIN is required';
      missingFields.push('SSN/PIN');
      console.log('SSN validation failed: required');
    } else if (formData.SSN.length !== 4) {
      errors.SSN = 'SSN/PIN must be exactly 4 digits';
      missingFields.push('SSN/PIN (must be exactly 4 digits)');
      console.log('SSN validation failed: length');
    }
    
    if (!formData.NAME) {
      errors.NAME = 'Full Name is required';
      missingFields.push('Full Name');
      console.log('Name validation failed');
    }
    
    if (!formData.GENDER) {
      errors.GENDER = 'Gender is required';
      missingFields.push('Gender');
      console.log('Gender validation failed');
    }
    
    if (!formData.DEFAULTDEPTID) {
      errors.DEFAULTDEPTID = 'Department is required';
      missingFields.push('Department');
      console.log('Department validation failed');
    }
    
    console.log('Validation errors:', errors);
    console.log('Missing fields:', missingFields);
    console.log('Validation passed:', Object.keys(errors).length === 0);
    
    // Set validation errors and return whether validation passed
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // New validation function specifically for edit employee form
  const validateEditFields = () => {
    const errors = {};
    
    // Only validate fields that are relevant for editing
    if (!formData.NAME) {
      errors.NAME = 'Full Name is required';
    }
    
    if (!formData.DEFAULTDEPTID) {
      errors.DEFAULTDEPTID = 'Department is required';
    }
    
    // SSN format validation removed - user can enter any length as long as it's not duplicate
    
    // Set validation errors and return whether validation passed
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Simplified and cleaner form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors only (don't clear success popup)
    setValidationErrors({});
    setShowErrorPopup(false);
    setErrorMessage('');
    setErrorDetails('');
    
    // Use different validation based on whether it's new or edit
    const isValid = currentId && currentId !== 'new' 
      ? validateEditFields() 
      : validateRequiredFields();
    
    if (!isValid) {
      // Get the specific missing fields for a clearer error message
      const missingFields = [];
      
      // Use different error message logic based on whether it's new or edit
      if (currentId && currentId !== 'new') {
        // For edit form - only check required fields for editing
        if (!formData.NAME) missingFields.push('Full Name');
        if (!formData.DEFAULTDEPTID) missingFields.push('Department');
        
        // SSN format validation removed for edit form
      } else {
        // For new employee form - check all required fields
        if (!formData.BADGENUMBER) missingFields.push('Badge Number');
        else if (formData.BADGENUMBER.length < 1 || formData.BADGENUMBER.length > 5) missingFields.push('Badge Number (1-5 digits)');
        
        if (!formData.SSN) missingFields.push('SSN/PIN');
        else if (formData.SSN.length !== 4) missingFields.push('SSN/PIN (4 digits)');
        
        if (!formData.NAME) missingFields.push('Full Name');
        if (!formData.GENDER) missingFields.push('Gender');
        if (!formData.DEFAULTDEPTID) missingFields.push('Department');
      }
      
      const errorMessage = missingFields.length > 0 
        ? `Please fill in the following required fields: ${missingFields.join(', ')}`
        : 'Please fix the validation errors highlighted in red.';
        
      showError('Validation Error', errorMessage);
      return;
    }

    // Validate badge number uniqueness for new employees only
    if (!currentId || currentId === 'new') {
      try {
        const response = await api.get('/employees/validate-unique', {
          params: { badgeNumber: formData.BADGENUMBER, currentUserId: currentId }
        });
        
        if (!response.data.isValid) {
          setValidationErrors(response.data.errors);
          showError('Validation Error', 'Please fix the validation errors highlighted in red.');
          return;
        }
      } catch (error) {
        console.error('Error validating badge number:', error);
        showError('Validation Error', 'Error validating badge number. Please try again.');
        return;
      }
    }

    setLoading(true);
    
    try {
      // Prepare submission data
      const submitData = {
        BADGENUMBER: formData.BADGENUMBER,
        SSN: formData.SSN,
        NAME: formData.NAME,
        GENDER: formData.GENDER,
        TITLE: formData.TITLE,
        BIRTHDAY: formData.BIRTHDAY || null,
        HIREDDAY: formData.HIREDDAY || null,
        STREET: formData.STREET || null,
        DEFAULTDEPTID: formData.DEFAULTDEPTID || null,
        privilege: formData.privilege,
        Appointment: formData.Appointment || null,
        InheritDeptSchClass: formData.InheritDeptSchClass || 1,
        PHOTO: photoFile ? await convertToBMP(photoFile) : null,
        
        // Default values for USERINFO table
        PAGER: null, CITY: null, STATE: null, ZIP: null,
        OPHONE: null, FPHONE: null, VERIFICATIONMETHOD: 1,
        SECURITYFLAGS: null, ATT: 1, INLATE: 0, OUTEARLY: 0,
        OVERTIME: 1, SEP: 1, HOLIDAY: 1, MINZU: null,
        PASSWORD: null, LUNCHDURATION: 1, MVerifyPass: null,
        Notes: null, InheritDeptSch: 1, AutoSchPlan: 1,
        MinAutoSchInterval: 24, RegisterOT: 1, InheritDeptRule: 0,
        EMPRIVILEGE: 0, CardNo: null, FaceGroup: 0, AccGroup: 1,
        UseAccGroupTZ: 1, VerifyCode: 0, Expires: 0, ValidCount: 0,
        ValidTimeBegin: null, ValidTimeEnd: null, TimeZone1: 1,
        TimeZone2: 0, TimeZone3: 0
      };

      // Submit data
      const response = currentId && currentId !== 'new' 
        ? await api.put(`/employees/${currentId}`, submitData)
        : await api.post('/employees', submitData);

      // Handle success - always show success if we reach here
      console.log('Response received:', response.data, 'Status:', response.status);
      console.log('Success condition met, calling showSuccess');
      showSuccess();
      
    } catch (error) {
      console.error('Error saving employee:', error);
      handleSaveError(error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to show error popup
  const showError = (title, message) => {
    console.log('showError called:', title, message);
    setErrorMessage(title);
    setErrorDetails(message);
    setShowErrorPopup(true);
    console.log('Error popup should be visible now');
  };

  // Helper function to show success popup
  const showSuccess = () => {
    console.log('showSuccess called');
    const successInfo = {
            success: true,
      isUpdate: currentId && currentId !== 'new',
            employeeName: formData.NAME,
      updatedFields: getUpdatedFields()
    };
    
    console.log('Setting success data:', successInfo);
    setSuccessData(successInfo);
    setShowSuccessPopup(true);
    console.log('Success popup should be visible now');
    
    // DON'T call onSuccess immediately - wait for user to click OK
    // if (onSuccess) {
    //   onSuccess(successInfo);
    // }
  };

  // Helper function to handle save errors
  const handleSaveError = (error) => {
    let errorTitle = 'Save Failed';
    let errorMsg = 'An unexpected error occurred while saving the employee.';
    
    if (error.response?.data) {
      const errorData = error.response.data;
      
      if (errorData.errors && typeof errorData.errors === 'object') {
        setValidationErrors(errorData.errors);
        errorTitle = 'Validation Error';
        errorMsg = 'Please fix the validation errors highlighted in red.';
      } else if (errorData.message?.includes('duplicate')) {
        if (errorData.message.includes('BADGENUMBER')) {
          setValidationErrors(prev => ({ ...prev, BADGENUMBER: 'Badge Number already exists' }));
          errorTitle = 'Duplicate Badge Number';
          errorMsg = 'The badge number you entered already exists. Please use a different badge number.';
        } else if (errorData.message.includes('SSN')) {
          setValidationErrors(prev => ({ ...prev, SSN: 'SSN already exists' }));
          errorTitle = 'Duplicate SSN';
          errorMsg = 'The SSN you entered already exists. Please use a different SSN.';
      } else {
          errorTitle = 'Duplicate Entry';
          errorMsg = errorData.message;
        }
      } else if (errorData.message) {
        errorTitle = 'Server Error';
        errorMsg = errorData.message;
      }
    } else if (error.code === 'NETWORK_ERROR' || !error.response) {
      errorTitle = 'Network Error';
      errorMsg = 'Unable to connect to the server. Please check your internet connection and try again.';
    }
    
    showError(errorTitle, errorMsg);
  };

  // Function to reset form
  const resetForm = () => {
    setFormData({
      BADGENUMBER: '',
      SSN: '',
      NAME: '',
      GENDER: '',
      TITLE: '',
      BIRTHDAY: '',
      HIREDDAY: '',
      STREET: '',
      DEFAULTDEPTID: '',
      privilege: 0,
      Appointment: '',
      InheritDeptSchClass: '',
      PAGER: null,
      CITY: null,
      STATE: null,
      ZIP: null,
      OPHONE: null,
      FPHONE: null,
      VERIFICATIONMETHOD: 1,
      SECURITYFLAGS: null,
      ATT: 1,
      INLATE: 0,
      OUTEARLY: 0,
      OVERTIME: 1,
      SEP: 1,
      HOLIDAY: 1,
      MINZU: null,
      PASSWORD: null,
      LUNCHDURATION: 1,
      MVerifyPass: null,
      Notes: null,
      InheritDeptSch: 1,
      AutoSchPlan: 1,
      MinAutoSchInterval: 24,
      RegisterOT: 1,
      InheritDeptRule: 0,
      EMPRIVILEGE: 0,
      CardNo: null,
      FaceGroup: 0,
      AccGroup: 1,
      UseAccGroupTZ: 1,
      VerifyCode: 0,
      Expires: 0,
      ValidCount: 0,
      ValidTimeBegin: null,
      ValidTimeEnd: null,
      TimeZone1: 1,
      TimeZone2: 0,
      TimeZone3: 0
    });
    setPhotoFile(null);
    setPhotoPreview('');
    setExistingPhoto('');
    setValidationErrors({});
  };

  // Function to handle success popup close - FIXED to properly close modal
  const handleSuccessClose = () => {
    console.log('handleSuccessClose called');
    setShowSuccessPopup(false);
    setSuccessData(null);
    resetForm();
    
    // Call onSuccess to close the modal after showing success
    if (isModal && onSuccess) {
      const successInfo = {
        success: true,
        isUpdate: currentId && currentId !== 'new',
        employeeName: formData.NAME,
        updatedFields: getUpdatedFields()
      };
      onSuccess(successInfo);
    }
  };

  const handleCancel = () => {
    console.log('handleCancel called');
    if (isModal && onSuccess) {
      onSuccess({ success: false, closeModal: true });
    } else {
      navigate('/hris-management');
    }
  };

  // Add function to fetch shift schedules from SHIFTSCHEDULE2 table
  const fetchShiftSchedules = async () => {
    try {
      const response = await api.get('/management/shiftschedules');
      setAvailableShiftSchedules(response.data || []);
    } catch (error) {
      console.error('Error fetching shift schedules:', error);
    }
  };

  // Determine if this is a new employee or editing existing
  const isNewEmployee = !currentId || currentId === 'new';
  
  // Render the component based on whether it's a modal or full page
  if (isModal) {
    return (
      <>
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information Section */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-6">Basic Information</h3>
              
            {/* First Row: Badge Number * and SSN/PIN * */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Badge Number */}
                <div>
                <label className={`block text-sm font-medium mb-2 ${
                  validationErrors.BADGENUMBER ? 'text-red-600' : 'text-gray-700'
                }`}>
                  Badge Number {currentId && currentId !== 'new' ? '' : '*'}
                  </label>
                  <input
                    type="text"
                    name="BADGENUMBER"
                    value={formData.BADGENUMBER}
                  onChange={handleBadgeNumberChange}
                  required={!currentId || currentId === 'new'}
                  disabled={currentId && currentId !== 'new'}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      currentId && currentId !== 'new' ? 'bg-gray-100 cursor-not-allowed' : ''
                  } ${validationErrors.BADGENUMBER ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Enter badge number"
                  />
                {validationErrors.BADGENUMBER && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.BADGENUMBER}</p>
                )}
                {currentId && currentId !== 'new' && (
                  <p className="mt-1 text-xs text-gray-500">Badge Number cannot be changed for existing employees</p>
                )}
                </div>

              {/* SSN/PIN - Hidden in portal user mode when editing */}
              {!portalUserMode || (portalUserMode && currentId === 'new') ? (
                <div>
                <label className={`block text-sm font-medium mb-2 ${
                  validationErrors.SSN ? 'text-red-600' : 'text-gray-700'
                }`}>
                  SSN/PIN {currentId && currentId !== 'new' ? '' : '*'}
                  </label>
                  <input
                    type="text"
                    name="SSN"
                    value={formData.SSN}
                  onChange={handleSSNChange}
                  required={!currentId || currentId === 'new'}
                  disabled={false}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.SSN ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter SSN"
                  />
                {validationErrors.SSN && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.SSN}</p>
                )}
                {currentId && currentId !== 'new' && (
                  <p className="mt-1 text-xs text-gray-500">SSN/PIN can be updated for existing employees</p>
                )}
                </div>
              ) : null}
              </div>

            {/* Second Row: Full Name * and Upload Photo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Full Name */}
                <div>
                <label className={`block text-sm font-medium mb-2 ${
                  validationErrors.NAME ? 'text-red-600' : 'text-gray-700'
                }`}>
                  Full Name {currentId && currentId !== 'new' ? '' : '*'}
                  </label>
                  <input
                    type="text"
                    name="NAME"
                    value={formData.NAME}
                    onChange={handleInputChange}
                  required={!currentId || currentId === 'new'}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.NAME ? 'border-red-500' : 'border-gray-300'
                  }`}
                    placeholder="Enter full name"
                  />
                {validationErrors.NAME && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.NAME}</p>
                )}
                </div>

              {/* Upload Photo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Photo
                  </label>
                <div className="flex items-center space-x-4">
                  {/* Photo Preview */}
                  <div className="flex-shrink-0">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Photo preview"
                        className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                      />
                    ) : existingPhoto ? (
                      <img
                        src={existingPhoto}
                        alt="Existing photo"
                        className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* File Input */}
                  <div className="flex-1">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                    <p className="mt-1 text-xs text-gray-500">JPG, PNG or GIF. Max size 2MB.</p>
                    </div>
                  </div>
                </div>
              </div>

            {/* Third Row: Gender * and Date of Birth - Hidden in portal user mode when editing */}
              {!portalUserMode || (portalUserMode && currentId === 'new') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Gender */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  validationErrors.GENDER ? 'text-red-600' : 'text-gray-700'
                }`}>
                  Gender {currentId && currentId !== 'new' ? '' : '*'}
                </label>
                <select
                  name="GENDER"
                  value={formData.GENDER}
                  onChange={handleInputChange}
                  required={!currentId || currentId === 'new'}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.GENDER ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                {validationErrors.GENDER && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.GENDER}</p>
                )}
              </div>

              {/* Date of Birth */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="BIRTHDAY"
                    value={formData.BIRTHDAY}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              ) : null}

            {/* Fourth Row: Department * and Position/Title (not required) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Department */}
                <div>
                <label className={`block text-sm font-medium mb-2 ${
                  validationErrors.DEFAULTDEPTID ? 'text-red-600' : 'text-gray-700'
                }`}>
                  Department {currentId && currentId !== 'new' ? '' : '*'}
                  </label>
                  <select
                    name="DEFAULTDEPTID"
                    value={formData.DEFAULTDEPTID}
                    onChange={handleInputChange}
                  required={!currentId || currentId === 'new'}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.DEFAULTDEPTID ? 'border-red-500' : 'border-gray-300'
                  }`}
                  >
                    <option value="">Select Department</option>
                    {departments.map(dept => (
                      <option key={dept.DEPTID} value={dept.DEPTID}>
                        {dept.DEPTNAME}
                      </option>
                    ))}
                  </select>
                {validationErrors.DEFAULTDEPTID && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.DEFAULTDEPTID}</p>
                )}
                </div>

              {/* Position/Title (not required) - Hidden in portal user mode when editing */}
              {!portalUserMode || (portalUserMode && currentId === 'new') ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position/Title
                  </label>
                  <input
                    type="text"
                    name="TITLE"
                    value={formData.TITLE}
                  onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter position/title"
                  />
                  </div>
              ) : null}
                </div>
              </div>

          {/* Other Information Section - Hidden in portal user mode when editing */}
          {!portalUserMode || (portalUserMode && currentId === 'new') ? (
            <div>
            <h3 className="text-lg font-medium text-gray-900 mb-6">Other Information</h3>
            
            {/* First Row: Hire Date and Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Hire Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hire Date
                </label>
                <input
                  type="date"
                  name="HIREDDAY"
                  value={formData.HIREDDAY}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  name="STREET"
                  value={formData.STREET}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter address"
                />
              </div>
            </div>

            {/* Second Row: Appointment and Shift Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Appointment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appointment
                  </label>
                  <select
                    name="Appointment"
                    value={formData.Appointment}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Appointment</option>
                  {getAppointmentOptions().map(appointment => (
                      <option key={appointment.id} value={appointment.id}>
                        {appointment.name}
                      </option>
                    ))}
                  </select>
                </div>

              {/* Shift Schedule */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shift Schedule
                  </label>
                  <select
                    name="InheritDeptSchClass"
                    value={formData.InheritDeptSchClass}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                  <option value="">Select Shift Schedule</option>
                    {availableShiftSchedules.map((shift) => (
                      <option key={shift.SHIFTNO} value={shift.SHIFTNO}>
                        {shift.SHIFTNAME}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            {/* Third Row: Privilege */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Privilege */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                  Privilege
                  </label>
                  <select
                    name="privilege"
                    value={formData.privilege}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                  <option value="0">Regular Employee</option>
                    <option value="1">Supervisor</option>
                    <option value="2">Manager</option>
                    <option value="3">Admin</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {/* Status Radio Button - Only shown in portal user mode when editing */}
          {portalUserMode && currentId && currentId !== 'new' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Status-</label>
              <div className="flex items-center space-x-6">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="status"
                    value="Activate"
                    checked={formData.status === 'Activate'}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Activate</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="status"
                    value="Deactivate"
                    checked={formData.status === 'Deactivate'}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Deactivate</span>
                </label>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (currentId && currentId !== 'new' ? 'Update Employee' : 'Create Employee')}
              </button>
            </div>
          </form>

        {/* Error Popup - Simplified and always on top */}
        {showErrorPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{zIndex: 99999}}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border-4 border-red-500">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
        </div>
      </div>
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                {errorMessage}
              </h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                {errorDetails}
              </p>
              <div className="flex justify-center">
              <button
                  onClick={() => {
                    setShowErrorPopup(false);
                    setErrorMessage('');
                    setErrorDetails('');
                  }}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  OK
              </button>
                </div>
              </div>
            </div>
          )}

        {/* Success Popup - Simplified and always on top */}
        {showSuccessPopup && successData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{zIndex: 99999}}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border-4 border-green-500">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                {successData.isUpdate ? 'Employee Updated Successfully!' : 'Employee Created Successfully!'}
                </h3>
              <p className="text-sm text-gray-600 text-center mb-4">
                {successData.isUpdate 
                  ? `The following information for ${successData.employeeName} has been updated:`
                  : `New employee ${successData.employeeName} has been created with the following information:`
                    }
                  </p>
                  
              {/* Show updated fields */}
              {successData.updatedFields && successData.updatedFields.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <ul className="space-y-1">
                    {successData.updatedFields.map((field, index) => (
                          <li key={index} className="flex items-center">
                            <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm">
                              <span className="font-medium">{field.name}</span>
                              {field.value && field.value !== 'Updated' && (
                                <span className="text-gray-600">: {field.value}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                
                <div className="flex justify-center">
                  <button
                  onClick={handleSuccessClose}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
      </>
    );
  }

  // For editing existing employees, show full page layout
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">
              Edit Employee
            </h2>
          </div>

          {/* Form content for editing - same as modal but with full page layout */}
          <div className="bg-white">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Basic Information Section */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-6">Basic Information</h3>
                
                {/* First Row: Badge Number * and SSN/PIN * */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Badge Number */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      validationErrors.BADGENUMBER ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      Badge Number {currentId && currentId !== 'new' ? '' : '*'}
                    </label>
                    <input
                      type="text"
                      name="BADGENUMBER"
                      value={formData.BADGENUMBER}
                      onChange={handleBadgeNumberChange}
                      required={!currentId || currentId === 'new'}
                      disabled={currentId && currentId !== 'new'}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        currentId && currentId !== 'new' ? 'bg-gray-100 cursor-not-allowed' : ''
                      } ${validationErrors.BADGENUMBER ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter badge number"
                    />
                    {validationErrors.BADGENUMBER && (
                      <p className="mt-1 text-sm text-red-600">{validationErrors.BADGENUMBER}</p>
                    )}
                    {currentId && currentId !== 'new' && (
                      <p className="mt-1 text-xs text-gray-500">Badge Number cannot be changed for existing employees</p>
                    )}
                  </div>

                  {/* SSN/PIN */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      validationErrors.SSN ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      SSN/PIN {currentId && currentId !== 'new' ? '' : '*'}
                    </label>
                    <input
                      type="text"
                      name="SSN"
                      value={formData.SSN}
                      onChange={handleSSNChange}
                      required={!currentId || currentId === 'new'}
                      disabled={false}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        validationErrors.SSN ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter SSN"
                    />
                    {validationErrors.SSN && (
                      <p className="mt-1 text-sm text-red-600">{validationErrors.SSN}</p>
                    )}
                    {currentId && currentId !== 'new' && (
                      <p className="mt-1 text-xs text-gray-500">SSN/PIN can be updated for existing employees</p>
                    )}
                  </div>
                </div>

                {/* Second Row: Full Name * and Upload Photo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Full Name */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      validationErrors.NAME ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      Full Name {currentId && currentId !== 'new' ? '' : '*'}
                    </label>
                    <input
                      type="text"
                      name="NAME"
                      value={formData.NAME}
                      onChange={handleInputChange}
                      required={!currentId || currentId === 'new'}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        validationErrors.NAME ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter full name"
                    />
                    {validationErrors.NAME && (
                      <p className="mt-1 text-sm text-red-600">{validationErrors.NAME}</p>
                    )}
                  </div>

                  {/* Upload Photo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Photo
                    </label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                      <div className="space-y-1 text-center">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          stroke="currentColor"
                          fill="none"
                          viewBox="0 0 48 48"
                          aria-hidden="true"
                        >
                          <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div className="flex text-sm text-gray-600">
                          <label
                            htmlFor="photo-upload"
                            className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                          >
                            <span>Upload a file</span>
                            <input
                              id="photo-upload"
                              name="photo"
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoChange}
                              className="sr-only"
                            />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Third Row: Gender * and Date of Birth */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Gender */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      validationErrors.GENDER ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      Gender {currentId && currentId !== 'new' ? '' : '*'}
                    </label>
                    <select
                      name="GENDER"
                      value={formData.GENDER}
                      onChange={handleInputChange}
                      required={!currentId || currentId === 'new'}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        validationErrors.GENDER ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select Gender</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                    {validationErrors.GENDER && (
                      <p className="mt-1 text-sm text-red-600">{validationErrors.GENDER}</p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      name="BIRTHDAY"
                      value={formData.BIRTHDAY}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Fourth Row: Department * and Position/Title (not required) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Department */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      validationErrors.DEFAULTDEPTID ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      Department {currentId && currentId !== 'new' ? '' : '*'}
                    </label>
                    <select
                      name="DEFAULTDEPTID"
                      value={formData.DEFAULTDEPTID}
                      onChange={handleInputChange}
                      required={!currentId || currentId === 'new'}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        validationErrors.DEFAULTDEPTID ? 'border-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept.DEPTID} value={dept.DEPTID}>
                          {dept.DEPTNAME}
                        </option>
                      ))}
                    </select>
                    {validationErrors.DEFAULTDEPTID && (
                      <p className="mt-1 text-sm text-red-600">{validationErrors.DEFAULTDEPTID}</p>
                    )}
                  </div>

                  {/* Position/Title (not required) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position/Title
                    </label>
                    <input
                      type="text"
                      name="TITLE"
                      value={formData.TITLE}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter position/title"
                    />
                    </div>
                  </div>
                </div>

              {/* Other Information Section */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-6">Other Information</h3>
                
                {/* First Row: Hire Date and Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Hire Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hire Date
                    </label>
                    <input
                      type="date"
                      name="HIREDDAY"
                      value={formData.HIREDDAY}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Address */}
                  <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    name="STREET"
                    value={formData.STREET}
                      onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter address"
                  />
                </div>
              </div>

                {/* Second Row: Appointment and Shift Schedule */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Appointment */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Appointment
                    </label>
                    <select
                      name="Appointment"
                      value={formData.Appointment}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Appointment</option>
                      {getAppointmentOptions().map(appointment => (
                        <option key={appointment.id} value={appointment.id}>
                          {appointment.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Shift Schedule */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Shift Schedule
                    </label>
                    <select
                      name="InheritDeptSchClass"
                      value={formData.InheritDeptSchClass}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Shift Schedule</option>
                      {availableShiftSchedules.map((shift) => (
                        <option key={shift.SHIFTNO} value={shift.SHIFTNO}>
                          {shift.SHIFTNAME}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Third Row: Privilege */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Privilege */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Privilege
                    </label>
                    <select
                      name="privilege"
                      value={formData.privilege}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="0">User</option>
                      <option value="1">Enroller</option>
                      <option value="2">Manager</option>
                      <option value="3">Admin</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (currentId && currentId !== 'new' ? 'Update Employee' : 'Create Employee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DTRPortalFormModal;
