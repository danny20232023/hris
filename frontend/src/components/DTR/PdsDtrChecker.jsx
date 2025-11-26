import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import MyPdsPrint from './MyPdsPrint';
import { getFieldLimit, validateFieldLength, getFieldDisplayName, PDS_FIELD_LIMITS } from '../../utils/pdsFieldLimits';

const PdsDtrChecker = ({ onBack, onSave }) => {
  const { user } = useAuth();
  const [activePage, setActivePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [completenessProgress, setCompletenessProgress] = useState(0);
  const [missingFields, setMissingFields] = useState([]);
  const [showAllMissingFields, setShowAllMissingFields] = useState(false);
  const [isPdsLocked, setIsPdsLocked] = useState(false);
  const [formData, setFormData] = useState({
    // DTR Integration fields
    dtruserid: '',
    badgenumber: '',
    // I. PERSONAL INFORMATION
    cs_id_no: '',
    surname: '',
    firstname: '',
    middlename: '',
    name_extension: '',
    date_of_birth: '',
    place_of_birth: '',
    sex: '',
    civil_status: '',
    height: '',
    height_unit: 'm',
    weight: '',
    weight_unit: 'kg',
    blood_type: '',
    gsis: '',
    pagibig: '',
    philhealth: '',
    sss: '',
    tin: '',
    agency_no: '',
    citizenship_filipino: true,
    citizenship_dual: false,
    dual_citizenship_type: '',
    dual_citizenship_country: '',
    
    // Address fields
    residential_house_block_lot: '',
    residential_street: '',
    residential_subdivision_village: '',
    residential_barangay: '',
    residential_city_municipality: '',
    residential_province: '',
    residential_zip_code: '',
    
    permanent_same_as_residential: false,
    permanent_house_block_lot: '',
    permanent_street: '',
    permanent_subdivision_village: '',
    permanent_barangay: '',
    permanent_city_municipality: '',
    permanent_province: '',
    permanent_zip_code: '',
    
    telephone: '',
    mobile: '',
    email: '',
    
    // II. FAMILY BACKGROUND
    spouse_surname: '',
    spouse_firstname: '',
    spouse_middlename: '',
    spouse_extension: '',
    spouse_occupation: '',
    spouse_employer_business_name: '',
    spouse_business_address: '',
    spouse_telephone: '',
    
    father_surname: '',
    father_firstname: '',
    father_middlename: '',
    father_extension: '',
    
    mother_surname: '',
    mother_firstname: '',
    mother_middlename: ''
  });

  // Dynamic arrays for multiple entries - Pages 1 & 2
  const [children, setChildren] = useState([{ full_name: '', date_of_birth: '' }]);
  const [education, setEducation] = useState([
    { level: 'Elementary', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
    { level: 'Secondary', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
    { level: 'Vocational Course', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
    { level: 'College', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
    { level: 'Graduate Studies', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' }
  ]);
  const [civilServiceEligibility, setCivilServiceEligibility] = useState([
    { eligibility_type: '', rating: '', date_of_examination: '', place_of_examination: '', license_number: '', date_of_validity: '' }
  ]);
  const [workExperience, setWorkExperience] = useState([
    { date_from: '', date_to: '', position_title: '', department_agency_company: '', monthly_salary: '', salary_grade_step: '', status_of_appointment: '', government_service: '', is_present: false }
  ]);
  const [pdsExists, setPdsExists] = useState(null);
  const [isMyPdsPreviewOpen, setIsMyPdsPreviewOpen] = useState(false);
  const [myPdsPreviewPage, setMyPdsPreviewPage] = useState(null);
  const myPdsPrintStyles = `
    @media print {
      body * {
        visibility: hidden;
      }

      .my-pds-print-overlay .print-scope,
      .my-pds-print-overlay .print-scope * {
        visibility: visible;
      }

      .my-pds-print-overlay .no-print {
        display: none !important;
      }

      @page {
        size: 8.5in 13in;
        margin: 0.25in;
      }
    }
  `;

  // Ensure education rows are always rendered in CSC chronological order
  const EDUCATION_LEVELS = [
    'Elementary',
    'Secondary',
    'Vocational Course',
    'College',
    'Graduate Studies'
  ];

  const formatDateForInput = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const yyyy = value.getFullYear();
      const mm = String(value.getMonth() + 1).padStart(2, '0');
      const dd = String(value.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const str = String(value).trim();
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return '';
  };

  const formatDateForDisplay = (dateValue) => {
    if (!dateValue || dateValue === '' || dateValue === '0000-00-00') {
      return '';
    }
    
    // If it's already in mm/dd/yyyy format, return as-is
    if (typeof dateValue === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Handle YYYY-MM-DD format - convert to mm/dd/yyyy
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-');
      return `${month}/${day}/${year}`;
    }
    
    // Handle Date object or ISO string
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return '';
      }
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch {
      return '';
    }
  };

  const extractYear = (value) => {
    if (!value) return '';
    // If already a 4-digit year
    if (/^\d{4}$/.test(String(value))) return String(value);
    // If date-like, extract year
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return String(d.getFullYear());
    } catch {
      return '';
    }
  };

  const normalizeEducationOrder = (list = []) => {
    const byLevel = new Map(
      (list || [])
        .filter(Boolean)
        .map(item => [item.level, item])
    );
    return EDUCATION_LEVELS.map(level => {
      const existing = byLevel.get(level) || {};
      return {
        level,
        school_name: existing.school_name || '',
        degree_course: existing.degree_course || existing.course || '',
        period_from: formatDateForInput(existing.period_from || existing.from || ''),
        period_to: formatDateForInput(existing.period_to || existing.to || ''),
        highest_level_units: existing.highest_level_units || existing.highest_level || '',
        year_graduated: extractYear(existing.year_graduated || ''),
        scholarship_honors: existing.scholarship_honors || existing.honor_received || ''
      };
    });
  };

  // Dynamic arrays for Page 3
  const [voluntaryWork, setVoluntaryWork] = useState([
    { organization_name_address: '', date_from: '', date_to: '', number_of_hours: '', position_nature_of_work: '' }
  ]);
  const [trainings, setTrainings] = useState([
    { training_title: '', date_from: '', date_to: '', number_of_hours: '', type_of_ld: '', conducted_sponsored_by: '' }
  ]);

  // Debug voluntary work state changes
  useEffect(() => {
    console.log('🔄 [PDS] Voluntary work state changed:', voluntaryWork);
  }, [voluntaryWork]);

  // Debug trainings state changes
  useEffect(() => {
    console.log('🔄 [PDS] Trainings state changed:', trainings);
  }, [trainings]);

  const [skills, setSkills] = useState([{ skill_hobby: '' }]);
  const [recognitions, setRecognitions] = useState([{ recognition: '' }]);
  const [memberships, setMemberships] = useState([{ organization: '' }]);

  // Debug skills state changes
  useEffect(() => {
    console.log('🔄 [PDS] Skills state changed:', skills);
  }, [skills]);

  // Debug memberships state changes
  useEffect(() => {
    console.log('🔄 [PDS] Memberships state changed:', memberships);
  }, [memberships]);

  // Page 4 - Declarations state (updated to match new database schema)
  const [declarations, setDeclarations] = useState({
    // Question 34: Within the third degree?
    thirtyfour_a: false,
    thirtyfour_b: false,
    thirtyfour_b_details: '',
    
    // Question 35a: Have you ever been found guilty of any administrative offense?
    thirtyfive_a: false,
    thirtyfive_a_details: '',
    
    // Question 35b: Have you been criminally charged before any court?
    thirtyfive_b: false,
    thirtyfive_datefiled: '',
    thirtyfive_statuses: '',
    
    // Question 36: Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation by any court or tribunal?
    thirtysix: false,
    thirtysix_details: '',
    
    // Question 37: Have you ever been separated from the service in any of the following modes: resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract or phased out, ABSENCE WITHOUT LEAVE (AWOL)?
    thirtyseven: false,
    thirtyseven_details: '',
    
    // Question 38a: Have you ever been a candidate in a national or local election held within the last year (except Barangay election)?
    thirtyeight_a: false,
    thirtyeight_a_details: '',
    
    // Question 38b: Have you resigned from the government service during the three (3)-month period before the last election to promote/actively campaign for a national or local candidate?
    thirtyeight_b: false,
    thirtyeight_b_details: '',
    
    // Question 39: Have you acquired the status of an immigrant or permanent resident of another country?
    thirtynine: false,
    thirtynine_details: '',
    
    // Question 40a: Are you a member of any indigenous group?
    forty_a: false,
    forty_a_details: '',
    
    // Question 40b: Are you a person with disability (PWD)?
    forty_b: false,
    forty_b_details: '',
    
    // Question 40c: Are you a solo parent?
    forty_c: false,
    forty_c_details: ''
  });

  // Page 4 - References and IDs
  const [references, setReferences] = useState([
    { reference_name: '', reference_address: '', reference_tel_no: '' }
  ]);
  const [governmentIds, setGovernmentIds] = useState([
    { government_issued_id: '', id_number: '', date_issued: '', place_of_issuance: '', status: 'active' }
  ]);
  const [isReplacingGovId, setIsReplacingGovId] = useState(false);
  const [hasPendingGovIdChange, setHasPendingGovIdChange] = useState(false);
  
  // Conversion modal states
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionType, setConversionType] = useState(''); // 'height' or 'weight'
  const [conversionInputs, setConversionInputs] = useState({
    value: '',
    unit: '',
    convertedValue: ''
  });

  // Page 4 - Signature and Photo
  const [signatureData, setSignatureData] = useState('');
  const [dateAccomplished, setDateAccomplished] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [thumbmarkData, setThumbmarkData] = useState('');

  // Lookup data
  const [bloodTypes, setBloodTypes] = useState([]);
  const [civilStatuses, setCivilStatuses] = useState([]);
  const [eligibilityTypes, setEligibilityTypes] = useState([]);
  const [loadingLookupData, setLoadingLookupData] = useState(false);
  
  // Debug eligibility types
  useEffect(() => {
    console.log('🔍 [PDS] Eligibility types state updated:', eligibilityTypes.length, 'items');
    console.log('🔍 [PDS] Eligibility types array:', eligibilityTypes);
    if (eligibilityTypes.length > 0) {
      console.log('📋 [PDS] First few eligibility types:', eligibilityTypes.slice(0, 3));
      console.log('📋 [PDS] Sample eligibility type structure:', eligibilityTypes[0]);
    } else {
      console.log('⚠️ [PDS] No eligibility types loaded');
    }
  }, [eligibilityTypes]);

  // Reset form state function - resets all state variables to initial values
  const resetFormState = () => {
    console.log('🔄 [PDS] Resetting form state for new session');
    
    // Reset form data to initial state
    setFormData({
      // DTR Integration fields
      dtruserid: '',
      badgenumber: '',
      // I. PERSONAL INFORMATION
      surname: '',
      firstname: '',
      middlename: '',
      extension: '',
      date_of_birth: '',
      place_of_birth: '',
      sex: '',
      civil_status: '',
      height: '',
      weight: '',
      blood_type: '',
      gsis: '',
      pagibig: '',
      philhealth: '',
      sss: '',
      tin: '',
      agency_no: '',
      // II. RESIDENTIAL ADDRESS
      residential_house_block_lot: '',
      residential_street: '',
      residential_subdivision_village: '',
      residential_barangay: '',
      residential_city_municipality: '',
      residential_province: '',
      residential_zip_code: '',
      // III. PERMANENT ADDRESS
      permanent_same_as_residential: false,
      permanent_house_block_lot: '',
      permanent_street: '',
      permanent_subdivision_village: '',
      permanent_barangay: '',
      permanent_city_municipality: '',
      permanent_province: '',
      permanent_zip_code: '',
      // IV. CONTACT INFORMATION
      telephone: '',
      mobile: '',
      email: '',
      // V. FAMILY BACKGROUND
      // Spouse Information
      spouse_surname: '',
      spouse_firstname: '',
      spouse_middlename: '',
      spouse_extension: '',
      spouse_occupation: '',
      employer_business_name: '',
      business_address: '',
      spouse_telephone_no: '',
      // Father's Information
      father_surname: '',
      father_firstname: '',
      father_middlename: '',
      father_extension: '',
      // Mother's Maiden Name
      mother_surname: '',
      mother_firstname: '',
      mother_middlename: '',
      // Citizenship
      citizenship_filipino: true, // Always true as per requirement
      citizenship_dual: false,
      dual_citizenship_type: '',
      dual_citizenship_country: ''
    });

    // Reset dynamic arrays to initial state
    setChildren([{ full_name: '', date_of_birth: '' }]);
    setEducation([
      { level: 'Elementary', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
      { level: 'Secondary', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
      { level: 'Vocational/Trade Course', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
      { level: 'College', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' },
      { level: 'Graduate Studies', school_name: '', degree_course: '', period_from: '', period_to: '', highest_level_units: '', year_graduated: '', scholarship_honors: '' }
    ]);
    setReferences([{ reference_name: '', reference_address: '', reference_tel_no: '' }]);
    setCivilServiceEligibility([]);
    setWorkExperience([]);
    setVoluntaryWork([]);
    setTrainings([]);
    setSkills([]);
    setGovernmentIds([{ government_issued_id: '', id_number: '', date_issued: '', place_of_issuance: '', status: 'active' }]);

    // Reset declarations (updated to match new database schema)
    setDeclarations({
      // Question 34: Within the third degree?
      thirtyfour_a: false,
      thirtyfour_b: false,
      thirtyfour_b_details: '',
      
      // Question 35a: Have you ever been found guilty of any administrative offense?
      thirtyfive_a: false,
      thirtyfive_a_details: '',
      
      // Question 35b: Have you been criminally charged before any court?
      thirtyfive_b: false,
      thirtyfive_datefiled: '',
      thirtyfive_statuses: '',
      
      // Question 36: Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation by any court or tribunal?
      thirtysix: false,
      thirtysix_details: '',
      
      // Question 37: Have you ever been separated from the service in any of the following modes: resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract or phased out, ABSENCE WITHOUT LEAVE (AWOL)?
      thirtyseven: false,
      thirtyseven_details: '',
      
      // Question 38a: Have you ever been a candidate in a national or local election held within the last year (except Barangay election)?
      thirtyeight_a: false,
      thirtyeight_a_details: '',
      
      // Question 38b: Have you resigned from the government service during the three (3)-month period before the last election to promote/actively campaign for a national or local candidate?
      thirtyeight_b: false,
      thirtyeight_b_details: '',
      
      // Question 39: Have you acquired the status of an immigrant or permanent resident of another country?
      thirtynine: false,
      thirtynine_details: '',
      
      // Question 40a: Are you a member of any indigenous group?
      forty_a: false,
      forty_a_details: '',
      
      // Question 40b: Are you a person with disability (PWD)?
      forty_b: false,
      forty_b_details: '',
      
      // Question 40c: Are you a solo parent?
      forty_c: false,
      forty_c_details: ''
    });

    // Reset UI state
    setActivePage(1);
    setIsReplacingGovId(false);
    setConversionInputs({ value: '', unit: '', convertedValue: '' });
    setShowConversionModal(false);
    setConversionType('');

    // Reset progress tracking
    setCompletenessProgress(0);
    setMissingFields([]);
    setShowAllMissingFields(false);

    // Reset media data
    setSignatureData('');
    setPhotoData('');
    setDateAccomplished('');

    // Reset error state
    setErrors({});

    // Reset loading state
    setLoading(false);
    
    console.log('✅ [PDS] Form state reset completed');
  };

  useEffect(() => {
    fetchLookupData();
  }, []);


  // Component unmount cleanup
  useEffect(() => {
    return () => {
      console.log('🧹 [PDS] Component unmounting, cleaning up state');
      // Reset form state when component unmounts to prevent memory leaks
      resetFormState();
    };
  }, []);

  // Retry mechanism if data loading fails
  const retryFetchLookupData = () => {
    console.log('🔄 [PDS] Retrying lookup data fetch...');
    fetchLookupData();
  };

  // Handle user changes
  useEffect(() => {
    if (user) {
      console.log('👤 [PDS] User loaded, resetting form state first');
      // Always reset form state first when user loads
      resetFormState();
      
      // Small delay to ensure state reset completes before loading new data
      setTimeout(() => {
        // Load PDS data for current user
        console.log('📄 [PDS] Loading PDS data for user:', user.USERID);
        fetchPDSData();
        
        // Fetch missing fields from API
        fetchMissingFields();
      }, 100);
    }
  }, [user]);

  // Check for missing fields whenever form data or array states change
  useEffect(() => {
    if (Object.keys(formData).length > 0 && user) {
      // Use API call for missing fields
      fetchMissingFields();
    }
  }, [formData, references, governmentIds, education, civilServiceEligibility, workExperience, children, isReplacingGovId, user]);

  const fetchPDSData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/pds-dtrchecker/me');
      const pdsData = response.data.data;
      setPdsExists(true);
      console.log('📅 [PDS] Received children data from API:', pdsData.children);
      console.log('📅 [PDS] Received employee data from API:', {
        date_of_birth: pdsData.employee.date_of_birth,
        place_of_birth: pdsData.employee.place_of_birth,
        sex: pdsData.employee.sex,
        birthdate: pdsData.employee.birthdate,
        birthplace: pdsData.employee.birthplace,
        gender: pdsData.employee.gender
      });
      console.log('🔍 [PDS] Full pdsData structure keys:', Object.keys(pdsData));
      console.log('🔍 [PDS] Eligibility data:', pdsData.eligibility);
      console.log('🔍 [PDS] Work experience data:', pdsData.workExperience);
      
      // Populate form with existing PDS data
      // Sanitize null/undefined values to empty strings for form inputs
      const sanitizedEmployeeData = Object.fromEntries(
        Object.entries(pdsData.employee).map(([key, value]) => {
          // Always ensure no null/undefined values for form inputs
          if (value === null || value === undefined) return [key, ''];
          
          // Handle date formatting for date inputs
          if (key === 'date_of_birth' && value) {
            // Extract date part directly from string without timezone conversion
            const stringValue = String(value).trim();
            
            // If already in YYYY-MM-DD format, return as is
            if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
              return [key, stringValue];
            }
            
            // If it's an ISO date string with time, extract just the date part (before 'T')
            if (stringValue.includes('T')) {
              const datePart = stringValue.split('T')[0];
              if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                console.log(`📅 [PDS] Extracting date from ISO: ${value} -> ${datePart}`);
                return [key, datePart];
              }
            }
            
            // If it's a date string with space separator (YYYY-MM-DD HH:MM:SS), extract date part
            if (stringValue.includes(' ')) {
              const datePart = stringValue.split(' ')[0];
              if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                console.log(`📅 [PDS] Extracting date from datetime: ${value} -> ${datePart}`);
                return [key, datePart];
              }
            }
            
            // If no valid format found, return empty string
            console.log(`⚠️ [PDS] Invalid date format: ${value}`);
            return [key, ''];
          }
          
          // Ensure all string values are properly handled
          if (typeof value === 'string') {
          return [key, value];
          }
          
          // Convert other types to string or empty string
          return [key, value ? String(value) : ''];
        })
      );
      
      setFormData(prev => ({
        ...prev,
        ...sanitizedEmployeeData,
        dtruserid: user.USERID || user.id,
        badgenumber: user.BADGENUMBER || user.badgenumber
      }));
      
      console.log('📅 [PDS] FormData after setting:', {
        date_of_birth: sanitizedEmployeeData.date_of_birth,
        place_of_birth: sanitizedEmployeeData.place_of_birth,
        sex: sanitizedEmployeeData.sex
      });
      
      // Set completeness progress
      const progressValue = Number(pdsData.employee.pdscompleprogress) || 0;
      setCompletenessProgress(progressValue);
      console.log('📊 [PDS] Loaded completeness progress:', progressValue);
      
      // Populate dynamic arrays
      if (pdsData.children && pdsData.children.length > 0) {
        // Ensure each child has the required fields with proper defaults
        const formattedChildren = pdsData.children.map(child => ({
          full_name: child.full_name || '',
          date_of_birth: child.date_of_birth || ''
        }));
        setChildren(formattedChildren);
        console.log('📅 [PDS] Loaded children:', formattedChildren);
      } else {
        // If no children data, ensure we have at least one empty row
        setChildren([{ full_name: '', date_of_birth: '' }]);
        console.log('📅 [PDS] No children data found, using default empty row');
      }
      if (pdsData.education && pdsData.education.length > 0) {
        setEducation(normalizeEducationOrder(pdsData.education));
      } else {
        // Even without data, enforce the fixed rows order
        setEducation(normalizeEducationOrder([]));
      }
      if (pdsData.eligibility && pdsData.eligibility.length > 0) {
        console.log('📋 Received eligibility data:', pdsData.eligibility);
        console.log('📋 Sample eligibility record:', pdsData.eligibility[0]);
        console.log('📋 Sample eligibility date fields:', {
          date_of_examination: pdsData.eligibility[0]?.date_of_examination,
          date_of_validity: pdsData.eligibility[0]?.date_of_validity,
          place_of_examination: pdsData.eligibility[0]?.place_of_examination
        });
        // Format dates for mm/dd/yyyy display
        const formattedEligibility = pdsData.eligibility.map(elig => {
          const formatDateForDisplay = (dateValue) => {
            if (!dateValue) return '';
            
            // If it's already in mm/dd/yyyy format, return as-is
            if (typeof dateValue === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
              return dateValue;
            }
            
            // Handle YYYY-MM-DD format - convert to mm/dd/yyyy
            if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              const [year, month, day] = dateValue.split('-');
              return `${month}/${day}/${year}`;
            }
            
            // If it's a Date object or ISO string, convert to mm/dd/yyyy
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const year = date.getFullYear();
              return `${month}/${day}/${year}`;
            }
            
            return '';
          };
          
          return {
            ...elig,
            date_of_examination: formatDateForDisplay(elig.date_of_examination),
            date_of_validity: formatDateForDisplay(elig.date_of_validity)
          };
        });
        console.log('📋 Formatted eligibility data:', formattedEligibility);
        setCivilServiceEligibility(formattedEligibility);
      } else {
        console.log('⚠️ No eligibility data found or empty array');
      }
      if (pdsData.workExperience && pdsData.workExperience.length > 0) {
        console.log('📋 Received work experience data:', pdsData.workExperience);
        console.log('📋 Sample work experience record:', pdsData.workExperience[0]);
        console.log('📋 Sample work experience fields:', {
          date_from: pdsData.workExperience[0]?.date_from,
          date_to: pdsData.workExperience[0]?.date_to,
          position_title: pdsData.workExperience[0]?.position_title,
          department_agency_company: pdsData.workExperience[0]?.department_agency_company,
          monthly_salary: pdsData.workExperience[0]?.monthly_salary,
          salary_grade_step: pdsData.workExperience[0]?.salary_grade_step,
          status_of_appointment: pdsData.workExperience[0]?.status_of_appointment,
          government_service: pdsData.workExperience[0]?.government_service,
          is_present: pdsData.workExperience[0]?.is_present
        });
        // Normalize work experience data to ensure proper boolean values and format dates
        const normalizedWorkExperience = pdsData.workExperience.map(work => {
          const isPresent = work.is_present === true || work.is_present === 1 || work.is_present === 'true' || work.ispresent === true || work.ispresent === 1 || work.ispresent === 'true';
          
          // Format dates for mm/dd/yyyy display
          const formatDateForDisplay = (dateValue) => {
            if (!dateValue) return '';
            
            // If it's already in mm/dd/yyyy format, return as-is
            if (typeof dateValue === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
              return dateValue;
            }
            
            // Handle YYYY-MM-DD format - convert to mm/dd/yyyy
            if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              const [year, month, day] = dateValue.split('-');
              return `${month}/${day}/${year}`;
            }
            
            // If it's a Date object or ISO string, convert to mm/dd/yyyy
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const year = date.getFullYear();
              return `${month}/${day}/${year}`;
            }
            
            return '';
          };
          
          return {
            ...work,
            is_present: isPresent,
            date_from: formatDateForDisplay(work.date_from),
            // If is_present is true but date_to is empty or invalid, set it to today's date
            date_to: isPresent && (!work.date_to || work.date_to === '0' || work.date_to === '0000-00-00' || work.date_to === '') 
              ? formatDateForDisplay(new Date().toISOString().split('T')[0])
              : formatDateForDisplay(work.date_to)
          };
        });
        setWorkExperience(normalizedWorkExperience);
      }
      
      // Page 3 data
      console.log('📋 [PDS] Checking voluntary work data:', pdsData.voluntaryWork);
      if (pdsData.voluntaryWork && pdsData.voluntaryWork.length > 0) {
        console.log('📋 Received voluntary work data:', pdsData.voluntaryWork);
        console.log('📋 Sample voluntary work record structure:', pdsData.voluntaryWork[0]);
        console.log('📋 Voluntary work record keys:', Object.keys(pdsData.voluntaryWork[0] || {}));
        setVoluntaryWork(pdsData.voluntaryWork);
      } else {
        console.log('⚠️ No voluntary work data found, keeping default empty row');
        // Don't reset if we already have data
        setVoluntaryWork(prev => prev.length > 0 ? prev : [{ organization_name_address: '', date_from: '', date_to: '', number_of_hours: '', position_nature_of_work: '' }]);
      }
      
      console.log('📋 [PDS] Checking trainings data:', pdsData.trainings);
      if (pdsData.trainings && pdsData.trainings.length > 0) {
        console.log('📋 Received trainings data:', pdsData.trainings);
        console.log('📋 Sample training record structure:', pdsData.trainings[0]);
        console.log('📋 Training record keys:', Object.keys(pdsData.trainings[0] || {}));
        console.log('📋 [PDS] Training conducted_sponsored_by value:', pdsData.trainings[0]?.conducted_sponsored_by);
        console.log('📋 [PDS] All training field values:');
        Object.keys(pdsData.trainings[0] || {}).forEach(key => {
          console.log(`  ${key}: "${pdsData.trainings[0][key]}"`);
        });
        setTrainings(pdsData.trainings);
      } else {
        console.log('⚠️ No trainings data found, keeping default empty row');
        // Don't reset if we already have data
        setTrainings(prev => prev.length > 0 ? prev : [{ training_title: '', date_from: '', date_to: '', number_of_hours: '', type_of_ld: '', conducted_sponsored_by: '' }]);
      }
      console.log('📋 [PDS] Checking skills data:', pdsData.skills);
      if (pdsData.skills && pdsData.skills.length > 0) {
        console.log('📋 Received skills data:', pdsData.skills);
        setSkills(pdsData.skills);
      } else {
        console.log('⚠️ No skills data found, keeping default empty row');
        setSkills(prev => prev.length > 0 ? prev : [{ skill_hobby: '' }]);
      }
      if (pdsData.recognitions && pdsData.recognitions.length > 0) {
        console.log('📋 Received recognitions data:', pdsData.recognitions);
        setRecognitions(pdsData.recognitions);
      }
      console.log('📋 [PDS] Checking memberships data:', pdsData.memberships);
      if (pdsData.memberships && pdsData.memberships.length > 0) {
        console.log('📋 Received memberships data:', pdsData.memberships);
        setMemberships(pdsData.memberships);
      } else {
        console.log('⚠️ No memberships data found, keeping default empty row');
        setMemberships(prev => prev.length > 0 ? prev : [{ organization: '' }]);
      }
      
      // Page 4 data
      if (pdsData.references && pdsData.references.length > 0) {
        console.log('📋 Received references data:', pdsData.references);
        setReferences(pdsData.references);
      }
      if (pdsData.governmentIds && pdsData.governmentIds.length > 0) {
        console.log('📋 Received government IDs data:', pdsData.governmentIds);
        console.log('📋 First government ID date_issued:', pdsData.governmentIds[0].date_issued);
        setGovernmentIds(pdsData.governmentIds);
      }
      if (pdsData.declarations && Object.keys(pdsData.declarations).length > 0) {
        console.log('📋 Received declarations data:', pdsData.declarations);
        
        // Helper function to format date for HTML date input
        const formatDateForInput = (dateStr) => {
          if (!dateStr || dateStr === '' || dateStr === '0000-00-00') {
            return '';
          }
          try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
              return '';
            }
            return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD for HTML date input
          } catch (error) {
            console.log('Date formatting error:', error, 'for date:', dateStr);
            return '';
          }
        };

        // Helper function to format date for display (mm/dd/yyyy)
        // Map backend field names to frontend field names based on new table structure
        console.log('🔍 [PDS] Raw declarations data from backend:', pdsData.declarations);
        
        // Helper function to convert database boolean values to JavaScript boolean
        const convertToBoolean = (value) => {
          if (value === true || value === 1 || value === '1' || value === 'true') return true;
          if (value === false || value === 0 || value === '0' || value === 'false') return false;
          return false;
        };

        const mappedDeclarations = {
          // Question 34: Within the third degree?
          thirtyfour_a: convertToBoolean(pdsData.declarations.thirtyfour_a),
          thirtyfour_b: convertToBoolean(pdsData.declarations.thirtyfour_b),
          thirtyfour_b_details: pdsData.declarations.thirtyfour_b_details || '',
          
          // Question 35a: Have you ever been found guilty of any administrative offense?
          thirtyfive_a: convertToBoolean(pdsData.declarations.thirtyfive_a),
          thirtyfive_a_details: pdsData.declarations.thirtyfive_a_details || '',
          
          // Question 35b: Have you been criminally charged before any court?
          thirtyfive_b: convertToBoolean(pdsData.declarations.thirtyfive_b),
          thirtyfive_datefiled: formatDateForInput(pdsData.declarations.thirtyfive_datefiled),
          thirtyfive_statuses: pdsData.declarations.thirtyfive_statuses || '',
          
          // Question 36: Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation by any court or tribunal?
          thirtysix: convertToBoolean(pdsData.declarations.thirtysix),
          thirtysix_details: pdsData.declarations.thirtysix_details || '',
          
          // Question 37: Have you ever been separated from the service in any of the following modes: resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract or phased out, ABSENCE WITHOUT LEAVE (AWOL)?
          thirtyseven: convertToBoolean(pdsData.declarations.thirtyseven),
          thirtyseven_details: pdsData.declarations.thirtyseven_details || '',
          
          // Question 38a: Have you ever been a candidate in a national or local election held within the last year (except Barangay election)?
          thirtyeight_a: convertToBoolean(pdsData.declarations.thirtyeight_a),
          thirtyeight_a_details: pdsData.declarations.thirtyeight_a_details || '',
          
          // Question 38b: Have you resigned from the government service during the three (3)-month period before the last election to promote/actively campaign for a national or local candidate?
          thirtyeight_b: convertToBoolean(pdsData.declarations.thirtyeight_b),
          thirtyeight_b_details: pdsData.declarations.thirtyeight_b_details || '',
          
          // Question 39: Have you acquired the status of an immigrant or permanent resident of another country?
          thirtynine: convertToBoolean(pdsData.declarations.thirtynine),
          thirtynine_details: pdsData.declarations.thirtynine_details || '',
          
          // Question 40a: Are you a member of any indigenous group?
          forty_a: convertToBoolean(pdsData.declarations.forty_a),
          forty_a_details: pdsData.declarations.forty_a_details || '',
          
          // Question 40b: Are you a person with disability (PWD)?
          forty_b: convertToBoolean(pdsData.declarations.forty_b),
          forty_b_details: pdsData.declarations.forty_b_details || '',
          
          // Question 40c: Are you a solo parent?
          forty_c: convertToBoolean(pdsData.declarations.forty_c),
          forty_c_details: pdsData.declarations.forty_c_details || ''
        };
        
        console.log('📋 Mapped declarations data:', mappedDeclarations);
        console.log('📋 thirtyfive_datefiled value:', mappedDeclarations.thirtyfive_datefiled);
        console.log('📋 thirtyfive_statuses value:', mappedDeclarations.thirtyfive_statuses);
        console.log('📋 [PDS] Sample values - thirtyfour_a:', mappedDeclarations.thirtyfour_a, 'thirtyfive_a:', mappedDeclarations.thirtyfive_a);
        console.log('📋 [PDS] Raw backend values - thirtyfour_a:', pdsData.declarations.thirtyfour_a, 'thirtyfive_a:', pdsData.declarations.thirtyfive_a);
        setDeclarations(mappedDeclarations);
      }
      if (pdsData.media && Object.keys(pdsData.media).length > 0) {
        console.log('📋 Received media data:', pdsData.media);
        
        // Load saved media data
        if (pdsData.media.signature) {
          console.log('✅ Loading saved signature:', pdsData.media.signature);
          setSignatureData(pdsData.media.signature);
        }
        if (pdsData.media.photo) {
          console.log('✅ Loading saved photo:', pdsData.media.photo);
          setPhotoData(pdsData.media.photo);
        }
        if (pdsData.media.thumb) {
          console.log('✅ Loading saved thumbmark:', pdsData.media.thumb);
          setThumbmarkData(pdsData.media.thumb);
        }
        if (pdsData.media.date_accomplished) {
          console.log('✅ Loading date accomplished:', pdsData.media.date_accomplished);
          setDateAccomplished(pdsData.media.date_accomplished);
        }
        
        // Check if PDS is locked
        if (pdsData.ispdsentrylock === 1 || pdsData.ispdsentrylock === true) {
          setIsPdsLocked(true);
          console.log('🔒 PDS is locked (ispdsentrylock = 1)');
        } else {
          setIsPdsLocked(false);
          console.log('🔓 PDS is unlocked (ispdsentrylock = 0)');
        }
      }
      
      console.log('✅ Loaded existing PDS data for user:', user.USERID || user.id);
    } catch (error) {
      if (error?.response?.status === 404) {
        setPdsExists(false);
        setLoading(false);
        return;
      }
      console.error('Error fetching PDS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLookupData = async () => {
    try {
      console.log('🔄 [PDS] Fetching lookup data...');
      setLoadingLookupData(true);
      console.log('🔄 [PDS] API base URL:', api.defaults.baseURL);
      console.log('🔄 [PDS] API headers:', api.defaults.headers);
      
      // Fetch all lookup data in one API call
      console.log('🔄 [PDS] Starting API call...');
      const lookupRes = await api.get('/pds-dtrchecker/lookup');
      
      console.log('📊 [PDS] Lookup response:', lookupRes.data);
      
      if (lookupRes.data.success && lookupRes.data.data) {
        const { bloodTypes, civilStatuses, eligibilityTypes } = lookupRes.data.data;
        
        console.log('🔍 [PDS] Data structure:', {
          bloodTypes: bloodTypes?.length || 0,
          civilStatuses: civilStatuses?.length || 0,
          eligibilityTypes: eligibilityTypes?.length || 0
        });
        
        setBloodTypes(bloodTypes || []);
        setCivilStatuses(civilStatuses || []);
        setEligibilityTypes(eligibilityTypes || []);
        
      console.log('✅ [PDS] Lookup data loaded successfully');
        console.log('📋 [PDS] Eligibility types set:', eligibilityTypes?.length || 0, 'items');
      } else {
        console.warn('⚠️ [PDS] Lookup data response was not successful');
        setBloodTypes([]);
        setCivilStatuses([]);
        setEligibilityTypes([]);
      }
    } catch (error) {
      console.error('❌ [PDS] Error fetching lookup data:', error);
      console.error('❌ [PDS] Error details:', error.response?.data || error.message);
      console.error('❌ [PDS] Error status:', error.response?.status);
      console.error('❌ [PDS] Error config:', error.config);
      
      // Don't set fallback data - let the dropdowns show loading state until data is available
      console.log('⚠️ [PDS] Lookup data fetch failed - will retry or show empty dropdowns');
      
      // Show error message in console for debugging
      console.error('❌ [PDS] Failed to load lookup data from HR201 database tables:');
      console.error('  - blood_types table');
      console.error('  - civilstatus table'); 
      console.error('  - eligibilitytypes table');
      console.error('Please ensure these tables exist and have data in the HR201 database.');
    } finally {
      setLoadingLookupData(false);
    }
  };

  // Helper function to sanitize values for form inputs
  const sanitizeValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return value ? String(value) : '';
  };

  // Helper to determine if form inputs should be disabled
  const isFormDisabled = isPdsLocked;

  const handleChange = (e) => {
    if (isPdsLocked) return;
    const { name, value, type, checked } = e.target;
    
    // Log date_of_birth changes for debugging
    if (name === 'date_of_birth') {
      console.log('📅 [UI] Date input changed:', value, 'Type:', typeof value, 'Format:', /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'YYYY-MM-DD' : 'Other');
    }
    
    // Ensure value is never undefined
    const safeValue = value || '';
    
    // Validate field length for text inputs
    if (type === 'text' || type === 'email' || type === 'tel' || (type === 'textarea' && safeValue)) {
      const validation = validateFieldLength(name, safeValue);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, [name]: validation.error }));
        // Still allow the change but show error
      } else {
        // Clear error if validation passes
        if (errors[name]) {
          setErrors(prev => ({ ...prev, [name]: '' }));
        }
      }
    }
    
    // Handle citizenship logic
    if (name === 'citizenship_dual') {
      setFormData(prev => ({
        ...prev,
        [name]: checked,
        // Clear dual citizenship fields when unchecked
        dual_citizenship_type: checked ? prev.dual_citizenship_type : '',
        dual_citizenship_country: checked ? prev.dual_citizenship_country : '',
        // Always set citizenship to Filipino
        citizenship: 'Filipino'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : safeValue
      }));
    }
    
    // Handle permanent address same as residential
    if (name === 'permanent_same_as_residential' && checked) {
      setFormData(prev => ({
        ...prev,
        permanent_house_block_lot: prev.residential_house_block_lot,
        permanent_street: prev.residential_street,
        permanent_subdivision_village: prev.residential_subdivision_village,
        permanent_barangay: prev.residential_barangay,
        permanent_city_municipality: prev.residential_city_municipality,
        permanent_province: prev.residential_province,
        permanent_zip_code: prev.residential_zip_code
      }));
    }
    
    // Handle civil status change - clear spouse fields if Single
    if (name === 'civil_status' && value === 'Single') {
      setFormData(prev => ({
        ...prev,
        spouse_surname: '',
        spouse_firstname: '',
        spouse_middlename: '',
        spouse_extension: '',
        spouse_occupation: '',
        spouse_employer_business_name: '',
        spouse_business_address: '',
        spouse_telephone: ''
      }));
    }
    
    // Clear error for this field if validation passes
    if (errors[name] && (type !== 'text' && type !== 'email' && type !== 'tel')) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Children management
  const addChild = () => {
    setChildren(prev => [...prev, { full_name: '', date_of_birth: '' }]);
  };

  const removeChild = (index) => {
    if (children.length > 1) {
      setChildren(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateChild = (index, field, value) => {
    console.log(`📅 [PDS] updateChild: index=${index}, field=${field}, value=${value}`);
    setChildren(prev => prev.map((child, i) => {
      if (i === index) {
        const updatedChild = { ...child, [field]: value };
        console.log(`📅 [PDS] Updated child ${index}:`, updatedChild);
        return updatedChild;
      }
      return child;
    }));
  };

  // Education management
  const updateEducation = (index, field, value) => {
    setEducation(prev => {
      const normalized = normalizeEducationOrder(prev);
      const updatedNormalized = normalized.map((edu, i) => 
        i === index ? { ...edu, [field]: value } : edu
      );
      
      // Convert back to the original format for storage
      return updatedNormalized;
    });
    
    console.log(`📝 [PDS] Updated education ${index} (${field}):`, value);
  };

  // Dynamic font size calculation for overflow prevention
  const getFontSize = (text, maxLength = 20) => {
    if (!text) return 'text-sm';
    const length = text.length;
    
    if (length <= 10) return 'text-sm';
    if (length <= 15) return 'text-xs';
    if (length <= 25) return 'text-xs';
    if (length <= 35) return 'text-xs';
    return 'text-xs'; // Very small for very long text
  };

  // Get appropriate CSS classes for text overflow
  const getTextClasses = (text, isInput = false) => {
    const baseClasses = isInput 
      ? "w-full px-2 py-1 border border-gray-300 rounded text-xs" 
      : "text-xs";
    
    const length = text ? text.length : 0;
    
    if (length > 30) {
      return `${baseClasses} text-xs leading-tight`;
    } else if (length > 20) {
      return `${baseClasses} text-xs`;
    } else {
      return `${baseClasses} text-sm`;
    }
  };

  // Get header font size based on text length and column width
  const getHeaderFontSize = (text, columnWidth) => {
    if (!text) return 'text-sm';
    
    const textLength = text.length;
    const widthPercent = columnWidth;
    
    // Adjust font size based on text length and available width
    if (widthPercent < 8) {
      // Very narrow columns
      if (textLength > 8) return 'text-xs';
      if (textLength > 5) return 'text-xs';
      return 'text-sm';
    } else if (widthPercent < 12) {
      // Narrow columns
      if (textLength > 12) return 'text-xs';
      if (textLength > 8) return 'text-xs';
      return 'text-sm';
    } else if (widthPercent < 20) {
      // Medium columns
      if (textLength > 20) return 'text-xs';
      if (textLength > 15) return 'text-xs';
      return 'text-sm';
    } else {
      // Wide columns
      if (textLength > 30) return 'text-xs';
      if (textLength > 20) return 'text-xs';
      return 'text-sm';
    }
  };

  // Civil Service Eligibility management
  const addEligibility = () => {
    setCivilServiceEligibility(prev => [...prev, { 
      eligibility_type: '', rating: '', date_of_examination: '', place_of_examination: '', license_number: '', date_of_validity: '' 
    }]);
  };

  const removeEligibility = (index) => {
    if (civilServiceEligibility.length > 1) {
      setCivilServiceEligibility(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setCivilServiceEligibility(prev => prev.map((_, i) => 
        i === index ? { 
          eligibility_type: '', rating: '', date_of_examination: '', place_of_examination: '', license_number: '', date_of_validity: '' 
        } : prev[i]
      ));
    }
  };

  const updateEligibility = (index, field, value) => {
    setCivilServiceEligibility(prev => prev.map((eligibility, i) => 
      i === index ? { ...eligibility, [field]: value } : eligibility
    ));
  };

  // Work Experience management
  const addWorkExperience = () => {
    setWorkExperience(prev => [...prev, { 
      date_from: '', date_to: '', position_title: '', department_agency_company: '', monthly_salary: '', salary_grade_step: '', status_of_appointment: '', government_service: '', is_present: false 
    }]);
  };

  const removeWorkExperience = (index) => {
    if (workExperience.length > 1) {
      setWorkExperience(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setWorkExperience(prev => prev.map((_, i) => 
        i === index ? { 
          date_from: '', date_to: '', position_title: '', department_agency_company: '', monthly_salary: '', salary_grade_step: '', status_of_appointment: '', government_service: '', is_present: false 
        } : prev[i]
      ));
    }
  };

  const updateWorkExperience = (index, field, value) => {
    setWorkExperience(prev => {
      let updated = prev.map((work, i) => {
        if (i === index) {
          const updatedWork = { ...work, [field]: value };
          
          // If setting is_present to true, set date_to to today's date
          if (field === 'is_present' && value === true) {
            const today = new Date();
            const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
            updatedWork.date_to = todayString;
          }
          
          // If setting is_present to false, clear date_to to allow user input
          if (field === 'is_present' && value === false) {
            updatedWork.date_to = '';
          }
          
          return updatedWork;
        }
        return work;
      });
      
      // If setting is_present to true for any item, set all other items to false
      if (field === 'is_present' && value === true) {
        updated = updated.map((work, i) => {
          if (i === index) {
            return { ...work, is_present: true, date_to: updated[i].date_to };
          } else {
            return { ...work, is_present: false };
          }
        });
      }
      
      // Sort the array: present items first, then by date_to descending
      updated.sort((a, b) => {
        // Present items first
        if (a.is_present === true && b.is_present !== true) return -1;
        if (a.is_present !== true && b.is_present === true) return 1;
        
        // If both present or both not present, sort by date_to descending
        if (a.date_to && b.date_to) {
          return new Date(b.date_to) - new Date(a.date_to);
        }
        return 0;
      });
      
      return updated;
    });
  };

  // ============ PAGE 3 HANDLERS ============
  
  // Voluntary Work management
  const addVoluntaryWork = () => {
    setVoluntaryWork(prev => [...prev, { organization_name_address: '', date_from: '', date_to: '', number_of_hours: '', position_nature_of_work: '' }]);
  };

  const removeVoluntaryWork = (index) => {
    setVoluntaryWork(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      // If all records are deleted, ensure at least one empty row remains
      return filtered.length === 0 
        ? [{ organization_name_address: '', date_from: '', date_to: '', number_of_hours: '', position_nature_of_work: '' }]
        : filtered;
    });
  };

  const updateVoluntaryWork = (index, field, value) => {
    setVoluntaryWork(prev => prev.map((work, i) => 
      i === index ? { ...work, [field]: value } : work
    ));
  };

  // Training management
  const addTraining = () => {
    setTrainings(prev => [...prev, { training_title: '', date_from: '', date_to: '', number_of_hours: '', type_of_ld: '', conducted_sponsored_by: '' }]);
  };

  const removeTraining = (index) => {
    if (trainings.length > 1) {
      setTrainings(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setTrainings(prev => prev.map((_, i) => 
        i === index ? { 
          training_title: '', date_from: '', date_to: '', number_of_hours: '', type_of_ld: '', conducted_sponsored_by: '' 
        } : prev[i]
      ));
    }
  };

  const updateTraining = (index, field, value) => {
    setTrainings(prev => prev.map((training, i) => 
      i === index ? { ...training, [field]: value } : training
    ));
  };

  // Skills management
  const addSkill = () => {
    setSkills(prev => [...prev, { skill_hobby: '' }]);
  };

  const removeSkill = (index) => {
    if (skills.length > 1) {
      setSkills(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setSkills(prev => prev.map((_, i) => 
        i === index ? { 
          skill_hobby: '' 
        } : prev[i]
      ));
    }
  };

  const updateSkill = (index, value) => {
    setSkills(prev => prev.map((skill, i) => 
      i === index ? { skill_hobby: value } : skill
    ));
  };

  // Recognition management
  const addRecognition = () => {
    setRecognitions(prev => [...prev, { recognition: '' }]);
  };

  const removeRecognition = (index) => {
    if (recognitions.length > 1) {
      setRecognitions(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setRecognitions(prev => prev.map((_, i) => 
        i === index ? { 
          recognition: '' 
        } : prev[i]
      ));
    }
  };

  const updateRecognition = (index, value) => {
    setRecognitions(prev => prev.map((recog, i) => 
      i === index ? { recognition: value } : recog
    ));
  };

  // Membership management
  const addMembership = () => {
    setMemberships(prev => [...prev, { organization: '' }]);
  };

  const removeMembership = (index) => {
    if (memberships.length > 1) {
      setMemberships(prev => prev.filter((_, i) => i !== index));
    } else {
      // If it's the last record, clear all fields instead of removing the row
      setMemberships(prev => prev.map((_, i) => 
        i === index ? { 
          organization: '' 
        } : prev[i]
      ));
    }
  };

  const updateMembership = (index, value) => {
    setMemberships(prev => prev.map((member, i) => 
      i === index ? { organization: value } : member
    ));
  };

  // ============ PAGE 4 HANDLERS ============

  // Declarations handler
  const handleDeclarationChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Special handling for date fields to ensure proper format
    let processedValue = value;
    if (name === 'thirtyfive_datefiled' && value) {
      // Convert mm/dd/yyyy to yyyy-mm-dd for database storage
      const dateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        processedValue = formattedDate;
        console.log('📅 Date conversion:', value, '→', formattedDate);
      } else {
        console.log('📅 Invalid date format:', value);
      }
    }
    
    setDeclarations(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : processedValue
    }));
  };

  const handleDeclarationToggle = (flagKey, value, detailKeys = []) => {
    setDeclarations(prev => {
      const updated = { ...prev, [flagKey]: value };
      if (!value && Array.isArray(detailKeys)) {
        detailKeys.forEach(detailKey => {
          if (detailKey) {
            updated[detailKey] = '';
          }
        });
        }
      return updated;
    });
  };

  // References management
  const addReference = () => {
    if (references.length < 3) {
      setReferences(prev => [...prev, { reference_name: '', reference_address: '', reference_tel_no: '' }]);
    }
  };

  const removeReference = (index) => {
    setReferences(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      // If all records are deleted, ensure at least one empty row remains
      return filtered.length === 0 
        ? [{ reference_name: '', reference_address: '', reference_tel_no: '' }]
        : filtered;
    });
  };

  const updateReference = (index, field, value) => {
    setReferences(prev => prev.map((ref, i) => 
      i === index ? { ...ref, [field]: value } : ref
    ));
  };

  // Government IDs management - Limited to 1 entry with replace functionality
  const addGovernmentId = () => {
    console.log('🔍 [Government ID] addGovernmentId called');
    console.log('🔍 [Government ID] Current governmentIds:', governmentIds);
    
    if (governmentIds.length === 0 || !governmentIds[0].government_issued_id) {
      // Add new government ID if none exists
      console.log('🔍 [Government ID] Adding new government ID');
      setGovernmentIds([{ government_issued_id: '', id_number: '', date_issued: '', place_of_issuance: '', status: 'active' }]);
      setHasPendingGovIdChange(true); // Mark as pending change for new government ID
    } else {
      // Start replace mode - clear fields but keep original data for comparison
      console.log('🔍 [Government ID] Starting replace mode');
      console.log('🔍 [Government ID] Original data to preserve:', governmentIds[0]);
      setIsReplacingGovId(true);
      setHasPendingGovIdChange(false); // Reset pending change when starting new replacement
      const newGovernmentId = { 
        government_issued_id: '', 
        id_number: '', 
        date_issued: '', 
        place_of_issuance: '', 
        status: 'active',
        originalData: governmentIds[0] // Keep original for comparison
      };
      console.log('🔍 [Government ID] New government ID with originalData:', newGovernmentId);
      setGovernmentIds([newGovernmentId]);
      console.log('✅ [Government ID] Replace mode activated');
    }
  };

  const acceptGovernmentIdChange = () => {
    console.log('🔍 [Government ID] acceptGovernmentIdChange called');
    const currentId = governmentIds[0];
    console.log('🔍 [Government ID] Current ID data:', currentId);
    
    // Validate all 4 fields are filled
    if (!currentId.government_issued_id?.trim() || 
        !currentId.id_number?.trim() || 
        !currentId.date_issued?.trim() || 
        !currentId.place_of_issuance?.trim()) {
      console.log('❌ [Government ID] Validation failed - missing fields');
      alert('Please fill in all fields (43.1, 43.2, 43.3, and 43.4) before accepting the change.');
      return;
    }
    console.log('✅ [Government ID] All fields validated');

    // Check if any value changed from original
    const originalData = currentId.originalData;
    console.log('🔍 [Government ID] Original data:', originalData);
    if (originalData) {
      const hasChanges = 
        currentId.government_issued_id !== originalData.government_issued_id ||
        currentId.id_number !== originalData.id_number ||
        currentId.date_issued !== originalData.date_issued ||
        currentId.place_of_issuance !== originalData.place_of_issuance;
      
      console.log('🔍 [Government ID] Has changes:', hasChanges);
      if (!hasChanges) {
        console.log('❌ [Government ID] No changes detected');
        alert('No changes detected. Please modify at least one field before accepting the change.');
        return;
      }
    }

    console.log('✅ [Government ID] Accepting change');
    // Accept the change - remove originalData and exit replace mode
    setGovernmentIds([{
      government_issued_id: currentId.government_issued_id,
      id_number: currentId.id_number,
      date_issued: currentId.date_issued,
      place_of_issuance: currentId.place_of_issuance,
      status: 'active'
    }]);
    // Exit replace mode but mark that we have a pending change
    setIsReplacingGovId(false);
    setHasPendingGovIdChange(true);
    console.log('✅ [Government ID] Change accepted, replace mode exited, pending change marked');
  };

  const cancelGovernmentIdChange = () => {
    // Restore original data
    const originalData = governmentIds[0]?.originalData;
    if (originalData) {
      setGovernmentIds([originalData]);
    }
    setIsReplacingGovId(false);
    setHasPendingGovIdChange(false);
    console.log('❌ [Government ID] Change cancelled, original data restored');
  };

  const removeGovernmentId = (index) => {
    // Only allow removal if there's more than 1 entry (shouldn't happen with limit of 1)
    if (governmentIds.length > 1) {
      setGovernmentIds(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateGovernmentId = (index, field, value) => {
    setGovernmentIds(prev => prev.map((id, i) => 
      i === index ? { ...id, [field]: value } : id
    ));
    // Mark as pending change when user modifies government ID fields
    if (field === 'government_issued_id' || field === 'id_number' || field === 'date_issued' || field === 'place_of_issuance') {
      setHasPendingGovIdChange(true);
    }
  };

  // Conversion modal functions
  const openConversionModal = (type) => {
    setConversionType(type);
    setConversionInputs({ 
      value: '', 
      unit: type === 'height' ? 'ft' : 'lbs',
      convertedValue: ''
    });
    setShowConversionModal(true);
  };

  const closeConversionModal = () => {
    setShowConversionModal(false);
    setConversionType('');
    setConversionInputs({ value: '', unit: '', convertedValue: '' });
  };

  const updateConversionInput = (field, value) => {
    setConversionInputs(prev => ({
      ...prev,
      [field]: value,
      convertedValue: '' // Reset converted value when input changes
    }));
  };

  const convertToMeters = (value, unit) => {
    const numValue = parseFloat(value) || 0;
    switch (unit) {
      case 'ft':
        return (numValue * 0.3048).toFixed(2);
      case 'cm':
        return (numValue / 100).toFixed(2);
      case 'in':
        return (numValue * 0.0254).toFixed(2);
      default:
        return value;
    }
  };

  const convertToKilograms = (value, unit) => {
    const numValue = parseFloat(value) || 0;
    switch (unit) {
      case 'lbs':
        return (numValue * 0.453592).toFixed(1);
      case 'g':
        return (numValue / 1000).toFixed(1);
      default:
        return value;
    }
  };

  const performConversion = () => {
    if (!conversionInputs.value || !conversionInputs.unit) return;
    
    let convertedValue = '';
    if (conversionType === 'height') {
      convertedValue = convertToMeters(conversionInputs.value, conversionInputs.unit);
    } else if (conversionType === 'weight') {
      convertedValue = convertToKilograms(conversionInputs.value, conversionInputs.unit);
    }
    
    setConversionInputs(prev => ({
      ...prev,
      convertedValue
    }));
  };

  const applyConversion = () => {
    if (!conversionInputs.convertedValue) return;
    
    if (conversionType === 'height') {
      setFormData(prev => ({
        ...prev,
        height: conversionInputs.convertedValue
      }));
    } else if (conversionType === 'weight') {
      setFormData(prev => ({
        ...prev,
        weight: conversionInputs.convertedValue
      }));
    }
    closeConversionModal();
  };

  // Image resizing helper functions
  const resizeImage = (file, maxSizeKB, targetFormat, quality = 0.9) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        
        // For photos, maintain passport photo aspect ratio (3.5cm x 4.5cm ≈ 0.78:1)
        // For thumbmarks, maintain reasonable size
        const maxDimension = targetFormat === 'jpeg' ? 600 : 400; // Photos get higher resolution
        
        if (targetFormat === 'jpeg') {
          // For passport photos, try to maintain aspect ratio around 0.78
          const targetRatio = 0.78;
          const currentRatio = width / height;
          
          if (Math.abs(currentRatio - targetRatio) > 0.1) {
            // Adjust dimensions to be closer to passport photo ratio
            if (currentRatio > targetRatio) {
              // Too wide, reduce width
              width = height * targetRatio;
            } else {
              // Too tall, reduce height
              height = width / targetRatio;
            }
          }
        }
        
        // Scale down if too large
        if (width > maxDimension) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        }
        if (height > maxDimension * 1.3) {
          width = (width * maxDimension * 1.3) / height;
          height = maxDimension * 1.3;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Set background for JPEG (white) or PNG (transparent)
        if (targetFormat === 'jpeg') {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
        }
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to target format with compression to meet size requirements
        let finalQuality = quality;
        let dataUrl;
        let attempts = 0;
        const maxAttempts = 20;
        
        do {
          dataUrl = canvas.toDataURL(`image/${targetFormat}`, finalQuality);
          
          // More accurate size calculation
          const base64Size = dataUrl.split(',')[1] ? dataUrl.split(',')[1].length : 0;
          const sizeInKB = (base64Size * 0.75) / 1024; // More accurate conversion
          
          if (sizeInKB <= maxSizeKB) {
            console.log(`✅ Image resized successfully: ${sizeInKB.toFixed(2)}KB (target: ${maxSizeKB}KB), quality: ${finalQuality}`);
            break;
          }
          
          finalQuality -= 0.05; // Smaller steps for better quality
          attempts++;
        } while (finalQuality > 0.1 && attempts < maxAttempts);
        
        if (attempts >= maxAttempts) {
          console.warn(`⚠️ Could not compress image below ${maxSizeKB}KB, using lowest quality available`);
        }
        
        resolve(dataUrl);
      };
      
      const objectURL = URL.createObjectURL(file);
      
      img.onerror = () => {
        URL.revokeObjectURL(objectURL);
        reject(new Error('Failed to load image'));
      };
      
      // Clean up object URL after image loads or errors
      img.addEventListener('load', () => {
        URL.revokeObjectURL(objectURL);
      }, { once: true });
      
      img.addEventListener('error', () => {
        URL.revokeObjectURL(objectURL);
      }, { once: true });
      
      img.src = objectURL;
    });
  };

  // File upload handlers
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Resize photo to 100-150KB and convert to JPEG
        const resizedPhoto = await resizeImage(file, 150, 'jpeg', 0.8);
        setPhotoData(resizedPhoto);
      } catch (error) {
        console.error('Error resizing photo:', error);
        // Fallback to original behavior if resizing fails
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotoData(reader.result);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleThumbmarkUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Resize thumbmark to 100-150KB and convert to PNG
        const resizedThumbmark = await resizeImage(file, 150, 'png', 0.9);
        setThumbmarkData(resizedThumbmark);
      } catch (error) {
        console.error('Error resizing thumbmark:', error);
        // Fallback to original behavior if resizing fails
        const reader = new FileReader();
        reader.onloadend = () => {
          setThumbmarkData(reader.result);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Resize signature to 100-150KB and convert to PNG
        const resizedSignature = await resizeImage(file, 150, 'png', 0.9);
        setSignatureData(resizedSignature);
      } catch (error) {
        console.error('Error resizing signature:', error);
        // Fallback to original behavior if resizing fails
        const reader = new FileReader();
        reader.onloadend = () => {
          setSignatureData(reader.result);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const validatePage1 = () => {
    const newErrors = {};
    
    // Only require essential fields for partial save
    // Users can save with minimal information and complete later
    if (!formData.surname && !formData.firstname) {
      newErrors.surname = 'At least surname or first name is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Function to check for missing fields
  const checkMissingFields = () => {
    const missing = [];
    
    // Page 1: Personal Information (excluding extension and cs_id_no)
    const personalFields = [
      { key: 'surname', label: 'Surname' },
      { key: 'firstname', label: 'First Name' },
      { key: 'middlename', label: 'Middle Name' },
      { key: 'date_of_birth', label: 'Date of Birth' },
      { key: 'place_of_birth', label: 'Place of Birth' },
      { key: 'sex', label: 'Sex' },
      { key: 'civil_status', label: 'Civil Status' },
      { key: 'height', label: 'Height' },
      { key: 'weight', label: 'Weight' },
      { key: 'blood_type', label: 'Blood Type' },
      { key: 'gsis', label: 'GSIS ID No.' },
      { key: 'pagibig', label: 'PAG-IBIG ID No.' },
      { key: 'philhealth', label: 'PhilHealth No.' },
      { key: 'sss', label: 'SSS No.' },
      { key: 'tin', label: 'TIN' },
      { key: 'agency_no', label: 'Agency Employee No.' }
    ];
    
    personalFields.forEach(field => {
      if (!formData[field.key] || formData[field.key] === '') {
        missing.push({ section: 'Personal Information', field: field.label, key: field.key });
      }
    });
    
    // Address fields (excluding House/Block/Lot No.)
    const addressFields = [
      { key: 'residential_province', label: 'Residential Province' },
      { key: 'residential_city_municipality', label: 'Residential City/Municipality' },
      { key: 'residential_barangay', label: 'Residential Barangay' },
      { key: 'residential_zip_code', label: 'Residential ZIP Code' },
      { key: 'residential_subdivision_village', label: 'Residential Subdivision/Village' },
      { key: 'residential_street', label: 'Residential Street' },
      { key: 'permanent_province', label: 'Permanent Province' },
      { key: 'permanent_city_municipality', label: 'Permanent City/Municipality' },
      { key: 'permanent_barangay', label: 'Permanent Barangay' },
      { key: 'permanent_zip_code', label: 'Permanent ZIP Code' },
      { key: 'permanent_subdivision_village', label: 'Permanent Subdivision/Village' },
      { key: 'permanent_street', label: 'Permanent Street' }
    ];
    
    addressFields.forEach(field => {
      if (!formData[field.key] || formData[field.key] === '') {
        missing.push({ section: 'Address', field: field.label, key: field.key });
      }
    });
    
    // Contact fields
    const contactFields = [
      { key: 'telephone', label: 'Telephone' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'email', label: 'Email' }
    ];
    
    contactFields.forEach(field => {
      if (!formData[field.key] || formData[field.key] === '') {
        missing.push({ section: 'Contact Information', field: field.label, key: field.key });
      }
    });
    
    // Spouse fields (excluding spouse_extension)
    if (formData.civil_status && formData.civil_status !== 'Single') {
      const spouseFields = [
        { key: 'spouse_surname', label: 'Spouse Surname' },
        { key: 'spouse_firstname', label: 'Spouse First Name' },
        { key: 'spouse_middlename', label: 'Spouse Middle Name' },
        { key: 'spouse_occupation', label: 'Spouse Occupation' }
      ];
      
      spouseFields.forEach(field => {
        if (!formData[field.key] || formData[field.key] === '') {
          missing.push({ section: 'Spouse Information', field: field.label, key: field.key });
        }
      });
    }
    
    // Parent fields (excluding father_extension)
    const parentFields = [
      { key: 'father_surname', label: 'Father Surname' },
      { key: 'father_firstname', label: 'Father First Name' },
      { key: 'father_middlename', label: 'Father Middle Name' },
      { key: 'mother_surname', label: 'Mother Surname' },
      { key: 'mother_firstname', label: 'Mother First Name' },
      { key: 'mother_middlename', label: 'Mother Middle Name' }
    ];
    
    parentFields.forEach(field => {
      if (!formData[field.key] || formData[field.key] === '') {
        missing.push({ section: 'Family Background', field: field.label, key: field.key });
      }
    });
    
    // Check children section - needs at least 1 record with meaningful data
    // Note: children are stored in separate state, not in formData
    if (!children || children.length === 0 || 
        !children.some(child => (child.full_name && child.full_name.trim() !== '') || (child.date_of_birth && child.date_of_birth.trim() !== ''))) {
      missing.push({ section: 'Family Background', field: 'Children Information', key: 'children' });
    }
    
    // Check education section - needs at least 1 complete row with all required fields
    // Note: education is stored in separate state, not in formData
    if (!education || education.length === 0) {
      missing.push({ section: 'Education', field: 'Education Information', key: 'education' });
    } else {
      // Check if any row is complete (all required fields filled)
      const hasCompleteRow = education.some(edu => {
        const hasRequiredFields = 
          edu.school_name && typeof edu.school_name === 'string' && edu.school_name.trim() !== '' &&
          edu.degree_course && typeof edu.degree_course === 'string' && edu.degree_course.trim() !== '' &&
          edu.period_from && typeof edu.period_from === 'string' && edu.period_from.trim() !== '' &&
          edu.period_to && typeof edu.period_to === 'string' && edu.period_to.trim() !== '' &&
          edu.highest_level_units && typeof edu.highest_level_units === 'string' && edu.highest_level_units.trim() !== '' &&
          edu.year_graduated && edu.year_graduated.toString().trim() !== '';
        return hasRequiredFields;
      });
      
      if (!hasCompleteRow) {
        missing.push({ section: 'Education', field: 'Education Information (Complete row required)', key: 'education' });
      }
    }
    
    // Check eligibility section - needs at least 1 record with meaningful data
    // Note: civilServiceEligibility is stored in separate state, not in formData
    if (!civilServiceEligibility || civilServiceEligibility.length === 0 || 
        !civilServiceEligibility.some(elig => (elig.eligibility_type && elig.eligibility_type.trim() !== '') || (elig.rating && elig.rating.trim() !== ''))) {
      missing.push({ section: 'Eligibility', field: 'Civil Service Eligibility', key: 'eligibility' });
    }
    
    // Check work experience section - needs at least 1 record with meaningful data
    // Note: workExperience is stored in separate state, not in formData
    if (!workExperience || workExperience.length === 0 || 
        !workExperience.some(work => (work.position_title && work.position_title.trim() !== '') || (work.department_name && work.department_name.trim() !== ''))) {
      missing.push({ section: 'Work Experience', field: 'Work Experience', key: 'workExperience' });
    }
    
    // Check references - requires exactly 3 records with meaningful data
    // Note: references are stored in separate state, not in formData
    if (!references || references.length < 3 || 
        references.filter(ref => ref.reference_name && ref.reference_name.trim() !== '').length < 3) {
      missing.push({ section: 'References', field: 'Character References (3 required)', key: 'references' });
    }
    
    // Check government IDs - needs at least 1 record with meaningful data
    // Note: governmentIds are stored in separate state, not in formData
    if (!governmentIds || governmentIds.length === 0 || 
        !governmentIds.some(gov => gov.government_issued_id && gov.government_issued_id.trim() !== '')) {
      missing.push({ section: 'Government IDs', field: 'Government Issued ID', key: 'governmentIds' });
    }
    
    setMissingFields(missing);
    return missing;
  };

  // Fetch missing fields from API with hyperlinks
  const fetchMissingFields = async () => {
    try {
      if (!user || pdsExists === false) return;
      
      console.log('🔍 [PDS] Fetching missing fields for user:', user.USERID);
      const response = await api.get('/pds-dtrchecker/missing-fields');
      
      if (response.data.success) {
        const { missingFields: apiMissingFields, totalMissing } = response.data;
        console.log('📊 [PDS] Received missing fields from API:', { totalMissing, missingFields: apiMissingFields });
        
        // Convert API response to flat array for display compatibility
        const flatMissingFields = [];
        if (apiMissingFields && typeof apiMissingFields === 'object') {
        Object.keys(apiMissingFields).forEach(page => {
            if (apiMissingFields[page] && typeof apiMissingFields[page] === 'object') {
          Object.keys(apiMissingFields[page]).forEach(section => {
                if (Array.isArray(apiMissingFields[page][section])) {
            apiMissingFields[page][section].forEach(field => {
              flatMissingFields.push({
                ...field,
                page: parseInt(page),
                section: section
              });
            });
                }
          });
            }
        });
        }
        
        setMissingFields(flatMissingFields);
      } else {
        console.warn('⚠️ [PDS] API returned unsuccessful response for missing fields');
        // Fallback to local check
        checkMissingFields();
      }
    } catch (error) {
      console.error('❌ [PDS] Error fetching missing fields from API:', error);
      // Fallback to local check if API fails
      checkMissingFields();
    }
  };

  // Function to focus on a specific field
  const focusOnField = (fieldData) => {
    try {
      console.log('🎯 [PDS] Attempting to focus on field:', fieldData);
      
      // Special case: Education Background is actually on page 1, not page 2
      if (fieldData.focusSelector === 'education-section' && activePage !== 1) {
        console.log('🎓 [PDS] Education section is on page 1, switching to page 1');
        setActivePage(1);
        setTimeout(() => {
          focusElement(fieldData);
        }, 500);
        return;
      }
      
      // First try to find the element on the current page
      let element = null;
      const selectors = [
        `#${fieldData.focusSelector}`,
        `[name="${fieldData.focusSelector}"]`,
        `input[name*="${fieldData.focusSelector}"]`,
        `select[name*="${fieldData.focusSelector}"]`,
        `textarea[name*="${fieldData.focusSelector}"]`,
        `[id*="${fieldData.focusSelector}"]`
      ];

      for (const selector of selectors) {
        element = document.querySelector(selector);
        if (element) {
          break;
        }
      }

      if (element) {
        // Element found on current page, focus it
        focusElement(fieldData);
      } else if (fieldData.page && fieldData.page !== activePage) {
        // Element not found on current page, try switching to the specified page
        console.log(`📄 [PDS] Switching to page ${fieldData.page} for field: ${fieldData.field}`);
        setActivePage(fieldData.page);
        
        // Wait for page switch before focusing, with longer timeout for education section
        setTimeout(() => {
          focusElement(fieldData);
        }, 500);
      } else {
        // Still try to focus even if we can't find it (might be a timing issue)
        focusElement(fieldData);
      }
    } catch (error) {
      console.error('❌ [PDS] Error focusing on field:', error);
    }
  };

  // Helper function to focus on the actual DOM element
  const focusElement = (fieldData) => {
    try {
      // Try multiple selector strategies
      const selectors = [
        `#${fieldData.focusSelector}`,
        `[name="${fieldData.focusSelector}"]`,
        `input[name*="${fieldData.focusSelector}"]`,
        `select[name*="${fieldData.focusSelector}"]`,
        `textarea[name*="${fieldData.focusSelector}"]`,
        `[id*="${fieldData.focusSelector}"]`
      ];

      let element = null;
      for (const selector of selectors) {
        element = document.querySelector(selector);
        if (element) {
          break;
        }
      }

      if (element) {
        // Scroll to element and focus
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest' 
        });
        
        // Add highlight effect
        element.style.backgroundColor = '#fef3c7'; // yellow-100
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, 2000);
        
        // Focus the element
        setTimeout(() => {
          if (element.focus) {
            element.focus();
          }
          // For section elements (like divs), try to focus the first input inside
          if (!element.focus && element.querySelector) {
            const firstInput = element.querySelector('input, select, textarea');
            if (firstInput && firstInput.focus) {
              firstInput.focus();
            }
          }
        }, 500);
        
        console.log('✅ [PDS] Successfully focused on field:', fieldData.field);
      } else {
        console.warn('⚠️ [PDS] Could not find element for field:', fieldData.field, 'selectors tried:', selectors);
      }
    } catch (error) {
      console.error('❌ [PDS] Error in focusElement:', error);
    }
  };

  const handlePrint = () => {
    if (!pdsExists) {
      alert('Please create or load your PDS before printing.');
      return;
    }

    const printPageMapping = {
      1: 1,
      2: 2,
      3: 3,
      4: 4
    };

    const targetPrintPage = printPageMapping[activePage] || null;
    setMyPdsPreviewPage(targetPrintPage);
    setIsMyPdsPreviewOpen(true);
  };

  // Helper function to format mm/dd/yyyy to yyyy-mm-dd for database storage
  const formatDateForDatabase = (dateValue) => {
    if (!dateValue || dateValue.trim() === '') return null;
    
    // If it's already in yyyy-mm-dd format, return as-is
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Handle mm/dd/yyyy format - convert to yyyy-mm-dd
    if (typeof dateValue === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
      const [month, day, year] = dateValue.split('/');
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    return null;
  };

  const handleCreateInitialPDS = async () => {
    try {
      setLoading(true);
      const minimalPayload = {
        employee: { dtruserid: user?.USERID },
        children: [],
        education: [],
        civil_service_eligibility: [],
        work_experience: [],
        voluntary_work: [],
        trainings: [],
        skills: [],
        recognitions: [],
        memberships: [],
        declarations: {},
        references: [],
        government_ids: [],
        is_replacing_gov_id: false,
        signature_data: null,
        date_accomplished: null,
        photo_data: null,
        thumbmark_data: null,
        is_draft: true
      };
      await api.post('/pds-dtrchecker/me', minimalPayload);
      setPdsExists(true);
      await fetchPDSData();
    } catch (e) {
      console.error('❌ [PDS] Failed to initialize PDS record:', e);
      alert('Failed to create initial PDS record. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Validate all field lengths before save
  const validateFieldLengths = () => {
    const validationErrors = {};
    let hasErrors = false;

    // Validate formData fields
    Object.keys(formData).forEach(fieldName => {
      const value = formData[fieldName];
      if (typeof value === 'string' && value.trim()) {
        const validation = validateFieldLength(fieldName, value);
        if (!validation.valid) {
          validationErrors[fieldName] = validation.error;
          hasErrors = true;
        }
      }
    });

    // Validate children
    children.forEach((child, index) => {
      if (child.full_name) {
        const validation = validateFieldLength('children_full_name', child.full_name);
        if (!validation.valid) {
          validationErrors[`children_${index}_full_name`] = validation.error;
          hasErrors = true;
        }
      }
    });

    // Validate education fields
    education.forEach((edu, index) => {
      if (edu.school_name) {
        const validation = validateFieldLength('education_school_name', edu.school_name);
        if (!validation.valid) {
          validationErrors[`education_${index}_school_name`] = validation.error;
          hasErrors = true;
        }
      }
      if (edu.degree_course) {
        const validation = validateFieldLength('education_degree_course', edu.degree_course);
        if (!validation.valid) {
          validationErrors[`education_${index}_degree_course`] = validation.error;
          hasErrors = true;
        }
      }
      if (edu.highest_level_units) {
        const validation = validateFieldLength('education_highest_level_units', edu.highest_level_units);
        if (!validation.valid) {
          validationErrors[`education_${index}_highest_level_units`] = validation.error;
          hasErrors = true;
        }
      }
      if (edu.scholarship_honors) {
        const validation = validateFieldLength('education_scholarship_honors', edu.scholarship_honors);
        if (!validation.valid) {
          validationErrors[`education_${index}_scholarship_honors`] = validation.error;
          hasErrors = true;
        }
      }
    });

    // Validate spouse fields
    if (formData.spouse_surname) {
      const validation = validateFieldLength('spouse_surname', formData.spouse_surname);
      if (!validation.valid) {
        validationErrors.spouse_surname = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_firstname) {
      const validation = validateFieldLength('spouse_firstname', formData.spouse_firstname);
      if (!validation.valid) {
        validationErrors.spouse_firstname = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_middlename) {
      const validation = validateFieldLength('spouse_middlename', formData.spouse_middlename);
      if (!validation.valid) {
        validationErrors.spouse_middlename = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_extension) {
      const validation = validateFieldLength('spouse_extension', formData.spouse_extension);
      if (!validation.valid) {
        validationErrors.spouse_extension = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_occupation) {
      const validation = validateFieldLength('spouse_occupation', formData.spouse_occupation);
      if (!validation.valid) {
        validationErrors.spouse_occupation = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_employer_business_name) {
      const validation = validateFieldLength('spouse_employer_business_name', formData.spouse_employer_business_name);
      if (!validation.valid) {
        validationErrors.spouse_employer_business_name = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_business_address) {
      const validation = validateFieldLength('spouse_business_address', formData.spouse_business_address);
      if (!validation.valid) {
        validationErrors.spouse_business_address = validation.error;
        hasErrors = true;
      }
    }
    if (formData.spouse_telephone) {
      const validation = validateFieldLength('spouse_telephone', formData.spouse_telephone);
      if (!validation.valid) {
        validationErrors.spouse_telephone = validation.error;
        hasErrors = true;
      }
    }

    // Validate work experience, voluntary work, training, references, etc.
    // (Add similar validation for other dynamic fields as needed)

    if (hasErrors) {
      setErrors(prev => ({ ...prev, ...validationErrors }));
      const errorFields = Object.keys(validationErrors).map(field => getFieldDisplayName(field)).join(', ');
      alert(`Please fix the following field(s) that exceed character limits:\n\n${errorFields}\n\nPlease reduce the text length for these fields before saving.`);
      return false;
    }

    return true;
  };

  const handleSubmit = async (isDraft = false) => {
    if (activePage === 1 && !validatePage1()) return;
    
    // Validate field lengths before save
    if (!validateFieldLengths()) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      console.log('📝 [PDS] Education data being saved:', education);
      
      // Debug: Log the formData being sent
      console.log('📝 [PDS] FormData being sent:', {
        dtruserid: formData.dtruserid,
        date_of_birth: formData.date_of_birth,
        place_of_birth: formData.place_of_birth,
        sex: formData.sex,
        blood_type: formData.blood_type
      });

      // Helper function to ensure date is in yyyy-mm-dd format
      const ensureDateFormat = (dateStr) => {
        // Handle undefined, null, or empty string
        if (dateStr === undefined || dateStr === null || dateStr === '') {
          console.log('⚠️ [ensureDateFormat] Date is undefined/null/empty:', dateStr);
          return null;
        }
        
        // Convert to string and trim
        const stringValue = String(dateStr).trim();
        
        // If already in yyyy-mm-dd format, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
          return stringValue;
        }
        
        // If in mm/dd/yyyy format, convert to yyyy-mm-dd
        const dateMatch = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          const [, month, day, year] = dateMatch;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // If invalid format, return null
        console.log('⚠️ [ensureDateFormat] Invalid date format for database:', dateStr, 'String value:', stringValue);
        return null;
      };

      const toTinyInt = (value) => (value ? 1 : 0);
      const textDetailValue = (flag, detail) => {
        if (!flag) return null;
        if (detail === undefined || detail === null) return null;
        if (typeof detail === 'string') {
          const trimmed = detail.trim();
          return trimmed.length ? trimmed : null;
        }
        return detail;
      };

      const bool34a = toTinyInt(declarations.thirtyfour_a);
      const bool34b = toTinyInt(declarations.thirtyfour_b);
      const bool35a = toTinyInt(declarations.thirtyfive_a);
      const bool35b = toTinyInt(declarations.thirtyfive_b);
      const bool36 = toTinyInt(declarations.thirtysix);
      const bool37 = toTinyInt(declarations.thirtyseven);
      const bool38a = toTinyInt(declarations.thirtyeight_a);
      const bool38b = toTinyInt(declarations.thirtyeight_b);
      const bool39 = toTinyInt(declarations.thirtynine);
      const bool40a = toTinyInt(declarations.forty_a);
      const bool40b = toTinyInt(declarations.forty_b);
      const bool40c = toTinyInt(declarations.forty_c);

      // Map new field names to backend expected field names
      const mappedDeclarations = {
        thirtyfour_a: bool34a,
        thirtyfour_b: bool34b,
        thirtyfour_b_details: textDetailValue(declarations.thirtyfour_b, declarations.thirtyfour_b_details),
        thirtyfive_a: bool35a,
        thirtyfive_a_details: textDetailValue(declarations.thirtyfive_a, declarations.thirtyfive_a_details),
        thirtyfive_b: bool35b,
        thirtyfive_datefiled: declarations.thirtyfive_b ? ensureDateFormat(declarations.thirtyfive_datefiled) : null,
        thirtyfive_statuses: textDetailValue(declarations.thirtyfive_b, declarations.thirtyfive_statuses),
        thirtysix: bool36,
        thirtysix_details: textDetailValue(declarations.thirtysix, declarations.thirtysix_details),
        thirtyseven: bool37,
        thirtyseven_details: textDetailValue(declarations.thirtyseven, declarations.thirtyseven_details),
        thirtyeight_a: bool38a,
        thirtyeight_a_details: textDetailValue(declarations.thirtyeight_a, declarations.thirtyeight_a_details),
        thirtyeight_b: bool38b,
        thirtyeight_b_details: textDetailValue(declarations.thirtyeight_b, declarations.thirtyeight_b_details),
        thirtynine: bool39,
        thirtynine_details: textDetailValue(declarations.thirtynine, declarations.thirtynine_details),
        forty_a: bool40a,
        forty_a_details: textDetailValue(declarations.forty_a, declarations.forty_a_details),
        forty_b: bool40b,
        forty_b_details: textDetailValue(declarations.forty_b, declarations.forty_b_details),
        forty_c: bool40c,
        forty_c_details: textDetailValue(declarations.forty_c, declarations.forty_c_details)
      };

      // Ensure date_of_birth is in correct format before sending
      console.log('📅 [Frontend] FormData.date_of_birth value:', formData.date_of_birth, 'Type:', typeof formData.date_of_birth);
      console.log('📅 [Frontend] FormData keys:', Object.keys(formData));
      console.log('📅 [Frontend] FormData.date_of_birth exists?', 'date_of_birth' in formData);
      
      const formattedBirthdate = ensureDateFormat(formData.date_of_birth);
      console.log('📅 [Frontend] Birthdate after ensureDateFormat:', formattedBirthdate, 'Type:', typeof formattedBirthdate);
      console.log('📅 [Frontend] Is valid YYYY-MM-DD format?', formattedBirthdate ? /^\d{4}-\d{2}-\d{2}$/.test(String(formattedBirthdate)) : 'null/undefined');
      
      // Build employee object, ensuring date_of_birth is explicitly set
      // Remove birthdate if it exists to avoid conflicts, and explicitly set date_of_birth
      const { birthdate, ...formDataWithoutBirthdate } = formData;
      const employeeData = { 
        ...formDataWithoutBirthdate, 
        dtruserid: user?.USERID || formData?.dtruserid,
        date_of_birth: formattedBirthdate || null, // Explicitly set to null if undefined
        place_of_birth: formData.place_of_birth?.trim() || ''
      };
      
      console.log('📅 [Frontend] Employee data date_of_birth:', employeeData.date_of_birth, 'Type:', typeof employeeData.date_of_birth);
      console.log('📅 [Frontend] Employee data has birthdate field?', 'birthdate' in employeeData);
      console.log('📅 [Frontend] Employee data has date_of_birth field?', 'date_of_birth' in employeeData);

      const payload = {
        employee: employeeData,
        children: children.filter(child => child.full_name || child.date_of_birth),
        education: education,
        civil_service_eligibility: civilServiceEligibility.filter(el => el.eligibility_type).map(el => ({
          ...el,
          date_of_examination: formatDateForDatabase(el.date_of_examination),
          date_of_validity: formatDateForDatabase(el.date_of_validity)
        })),
        work_experience: workExperience.filter(work => work.position_title || work.department_agency_company).map(work => ({
          ...work,
          date_from: formatDateForDatabase(work.date_from),
          date_to: formatDateForDatabase(work.date_to)
        })),
        // Page 3 data
        voluntary_work: voluntaryWork.filter(work => work.organization_name_address || work.position_nature_of_work),
        trainings: trainings.filter(training => training.training_title || training.conducted_sponsored_by),
        skills: skills.filter(skill => skill.skill_hobby),
        recognitions: recognitions.filter(recog => recog.recognition),
        memberships: memberships.filter(member => member.organization),
        // Page 4 data
        declarations: mappedDeclarations,
        references: references.filter(ref => ref.reference_name),
        government_ids: governmentIds.filter(id => id.government_issued_id || id.id_number),
        is_replacing_gov_id: hasPendingGovIdChange,
        signature_data: signatureData,
        date_accomplished: dateAccomplished && dateAccomplished.trim() !== '' ? dateAccomplished.trim() : null,
        photo_data: photoData,
        thumbmark_data: thumbmarkData,
        is_draft: isDraft
      };

      // Debug: Log declarations data being sent
      console.log('📝 [PDS] Declarations data being sent:', mappedDeclarations);
      console.log('📝 [PDS] Date field value being sent:', mappedDeclarations.criminally_charged_date);
      
      // Log complete employee payload to verify birthdate format
      console.log('📦 [Frontend] Complete employee payload being sent:', {
        date_of_birth: payload.employee.date_of_birth,
        place_of_birth: payload.employee.place_of_birth,
        dtruserid: payload.employee.dtruserid
      });
      
      const response = await api.post('/pds-dtrchecker/me', payload);
      alert(isDraft ? 'PDS draft saved successfully! You can continue editing later.' : 'PDS saved successfully!');
      
      // Reset pending change flag after successful save
      if (hasPendingGovIdChange) {
        setHasPendingGovIdChange(false);
        console.log('✅ [PDS] Government ID replacement completed, reset pending change flag');
      }
      
      // If date_accomplished was provided, refresh PDS data to get updated lock status
      if (dateAccomplished && dateAccomplished.trim() !== '') {
        await fetchPDSData();
      }
      
      if (onSave) {
        onSave();
      }
      
      // Update progress from response
      if (response.data.progress !== undefined) {
        const progressValue = Number(response.data.progress) || 0;
        setCompletenessProgress(progressValue);
        console.log('📊 [PDS] Updated completeness progress:', progressValue);
      }
      
      if (onSave) onSave(); // Refresh parent list
      
      // Only close modal if it's not a draft save
      if (!isDraft && onClose) {
        onClose(); // Close modal only for final save
      }
    } catch (error) {
      console.error('Error saving PDS:', error);
      
      // Parse database errors for field-specific messages
      let errorMessage = 'Failed to save PDS';
      const errorResponse = error?.response?.data;
      const errorMessageText = errorResponse?.message || error?.message || '';
      
      // Check for MySQL "Data too long" errors
      if (errorMessageText.includes('Data too long') || errorMessageText.includes('ER_DATA_TOO_LONG')) {
        // Try to extract column name from error message
        const columnMatch = errorMessageText.match(/column ['"]([^'"]+)['"]/i) || 
                           errorMessageText.match(/for column ['"]([^'"]+)['"]/i);
        
        if (columnMatch) {
          const columnName = columnMatch[1];
          // Map database column names to user-friendly field names
          const fieldNameMap = {
            'surname': 'Surname',
            'firstname': 'First Name',
            'middlename': 'Middle Name',
            'extension': 'Name Extension',
            'birthplace': 'Place of Birth',
            'gsis': 'GSIS ID No.',
            'pagibig': 'PAG-IBIG ID No.',
            'philhealth': 'PhilHealth No.',
            'sss': 'SSS No.',
            'tin': 'TIN No.',
            'agency_no': 'Agency Employee No.',
            'telephone': 'Telephone No.',
            'mobile': 'Mobile No.',
            'email': 'E-mail Address',
          };
          
          const friendlyName = fieldNameMap[columnName] || columnName;
          errorMessage = `Failed to save PDS: The field "${friendlyName}" exceeds the maximum character limit. Please reduce the text length and try again.`;
        } else {
          errorMessage = `Failed to save PDS: One or more fields exceed the maximum character limit. Please check your entries and reduce text length where necessary.`;
        }
      } else if (errorResponse?.error) {
        // Use backend error message if available
        errorMessage = `Failed to save PDS: ${errorResponse.error}`;
      } else if (errorMessageText) {
        errorMessage = `Failed to save PDS: ${errorMessageText}`;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderPage1 = () => (
    <div className="space-y-8">
      {/* I. PERSONAL INFORMATION */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">I</span>
          PERSONAL INFORMATION
        </h3>
        
        {/* CS ID No */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">1. CS ID No</label>
          <input
            type="text"
            name="cs_id_no"
            value={sanitizeValue(formData.cs_id_no)}
            onChange={handleChange}
            placeholder="(Do not fill up. For CSC use only)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
            disabled
          />
        </div>

        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2. SURNAME <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="surname"
              value={sanitizeValue(formData.surname)}
              onChange={handleChange}
              maxLength={getFieldLimit('surname')}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.surname ? 'border-red-500' : 'border-gray-300'} ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              required
            />
            {errors.surname && <p className="text-red-500 text-xs mt-1">{errors.surname}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2.1. FIRST NAME <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="firstname"
              value={sanitizeValue(formData.firstname)}
              onChange={handleChange}
              maxLength={getFieldLimit('firstname')}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.firstname ? 'border-red-500' : 'border-gray-300'} ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              required
            />
            {errors.firstname && <p className="text-red-500 text-xs mt-1">{errors.firstname}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2.2. MIDDLE NAME</label>
            <input
              type="text"
              name="middlename"
              value={sanitizeValue(formData.middlename)}
              onChange={handleChange}
              maxLength={getFieldLimit('middlename')}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2.3. NAME EXTENSION (JR., SR)</label>
            <input
              type="text"
              name="name_extension"
              value={formData.name_extension}
              onChange={handleChange}
              placeholder="Jr., Sr., III"
              maxLength={getFieldLimit('name_extension')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Birth Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">3. DATE OF BIRTH</label>
            <input
              type="date"
              name="date_of_birth"
              value={sanitizeValue(formData.date_of_birth)}
              onChange={handleChange}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">4. PLACE OF BIRTH</label>
            <input
              type="text"
              name="place_of_birth"
              value={formData.place_of_birth}
              onChange={handleChange}
              maxLength={getFieldLimit('place_of_birth')}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
          </div>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">5. SEX <span className="text-red-500">*</span></label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input type="radio" name="sex" value="Male" checked={formData.sex === 'Male'} onChange={handleChange} disabled={isFormDisabled} className={`mr-2 ${isFormDisabled ? 'cursor-not-allowed' : ''}`} />
                Male
              </label>
              <label className="flex items-center">
                <input type="radio" name="sex" value="Female" checked={formData.sex === 'Female'} onChange={handleChange} disabled={isFormDisabled} className={`mr-2 ${isFormDisabled ? 'cursor-not-allowed' : ''}`} />
                Female
              </label>
            </div>
            {errors.sex && <p className="text-red-500 text-xs mt-1">{errors.sex}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">6. CIVIL STATUS <span className="text-red-500">*</span></label>
            <select
              name="civil_status"
              value={formData.civil_status}
              onChange={handleChange}
              disabled={isFormDisabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.civil_status ? 'border-red-500' : 'border-gray-300'} ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              required
            >
              <option value="">Select Status</option>
              {loadingLookupData ? (
                <option disabled>Loading civil statuses...</option>
              ) : civilStatuses.length > 0 ? (
                civilStatuses.map(status => (
                  <option key={status.id} value={status.civil_status}>{status.civil_status}</option>
                ))
              ) : (
                <option disabled>No civil status data available</option>
              )}
            </select>
            {errors.civil_status && <p className="text-red-500 text-xs mt-1">{errors.civil_status}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">7. HEIGHT (meters)</label>
            <div className="flex space-x-2">
              <input
                type="number"
                step="0.01"
                name="height"
                value={formData.height}
                onChange={handleChange}
                placeholder="1.75"
                min="0.01"
                max="3.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => openConversionModal('height')}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Height Converter"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter height in meters (m)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">8. WEIGHT (kilograms)</label>
            <div className="flex space-x-2">
              <input
                type="number"
                step="0.1"
                name="weight"
                value={formData.weight}
                onChange={handleChange}
                placeholder="70"
                min="1"
                max="500"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => openConversionModal('weight')}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Weight Converter"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter weight in kilograms (kg)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">9. BLOOD TYPE</label>
            <select
              name="blood_type"
              value={formData.blood_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Blood Type</option>
              {loadingLookupData ? (
                <option disabled>Loading blood types...</option>
              ) : bloodTypes.length > 0 ? (
                bloodTypes.map(bloodType => (
                  <option key={bloodType.id} value={bloodType.blood_type}>{bloodType.blood_type}</option>
                ))
              ) : (
                <option disabled>No blood type data available</option>
              )}
            </select>
          </div>
        </div>

        {/* Government IDs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">10. GSIS ID NO.</label>
            <input type="text" name="gsis" value={formData.gsis} onChange={handleChange} maxLength={getFieldLimit('gsis')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">11. PAG-IBIG ID NO.</label>
            <input type="text" name="pagibig" value={formData.pagibig} onChange={handleChange} maxLength={getFieldLimit('pagibig')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">12. PHILHEALTH NO.</label>
            <input type="text" name="philhealth" value={formData.philhealth} onChange={handleChange} maxLength={getFieldLimit('philhealth')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">13. SSS NO.</label>
            <input type="text" name="sss" value={formData.sss} onChange={handleChange} maxLength={getFieldLimit('sss')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">14. TIN NO.</label>
            <input type="text" name="tin" value={formData.tin} onChange={handleChange} maxLength={getFieldLimit('tin')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">15. AGENCY EMPLOYEE NO.</label>
            <input type="text" name="agency_no" value={formData.agency_no} onChange={handleChange} maxLength={getFieldLimit('agency_no')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Citizenship */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">16. CITIZENSHIP</label>
          <div className="flex space-x-6 mb-4">
            <label className="flex items-center">
              <input 
                type="checkbox" 
                name="citizenship_filipino" 
                checked={true} 
                disabled={true}
                className="mr-2 bg-gray-300" 
              />
              <span className="text-gray-600">Filipino (Default)</span>
            </label>
            <label className="flex items-center">
              <input type="checkbox" name="citizenship_dual" checked={formData.citizenship_dual} onChange={handleChange} className="mr-2" />
              Dual Citizenship
            </label>
          </div>
          {formData.citizenship_dual && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select name="dual_citizenship_type" value={formData.dual_citizenship_type} onChange={handleChange} className="px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Select Type</option>
                <option value="by_birth">By Birth</option>
                <option value="by_naturalization">By Naturalization</option>
              </select>
              <input name="dual_citizenship_country" value={formData.dual_citizenship_country} onChange={handleChange} placeholder="Country" maxLength={getFieldLimit('dual_citizenship_country')} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          )}
        </div>

        {/* Address Sections - Horizontal Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Residential Address */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">17. RESIDENTIAL ADDRESS</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.1 House/Block/Lot No.</label>
                <input name="residential_house_block_lot" value={formData.residential_house_block_lot} onChange={handleChange} placeholder="Enter house/block/lot number" maxLength={getFieldLimit('residential_house_block_lot')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.2 Street</label>
                <input name="residential_street" value={formData.residential_street} onChange={handleChange} placeholder="Enter street name" maxLength={getFieldLimit('residential_street')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.3 Subdivision/Village</label>
                <input name="residential_subdivision_village" value={formData.residential_subdivision_village} onChange={handleChange} placeholder="Enter subdivision or village name" maxLength={getFieldLimit('residential_subdivision_village')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.4 Barangay</label>
                <input name="residential_barangay" value={formData.residential_barangay} onChange={handleChange} placeholder="Enter barangay name" maxLength={getFieldLimit('residential_barangay')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.5 City/Municipality</label>
                <input name="residential_city_municipality" value={formData.residential_city_municipality} onChange={handleChange} placeholder="Enter city or municipality" maxLength={getFieldLimit('residential_city_municipality')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.6 Province</label>
                <input name="residential_province" value={formData.residential_province} onChange={handleChange} placeholder="Enter province" maxLength={getFieldLimit('residential_province')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">17.7 ZIP CODE</label>
                <input name="residential_zip_code" value={formData.residential_zip_code} onChange={handleChange} placeholder="Enter ZIP code" maxLength={getFieldLimit('residential_zip_code')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
            </div>
          </div>

          {/* Permanent Address */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <h4 className="text-lg font-semibold text-gray-900">18. PERMANENT ADDRESS</h4>
              <label className="flex items-center">
                <input type="checkbox" name="permanent_same_as_residential" checked={formData.permanent_same_as_residential} onChange={handleChange} className="mr-2" />
                Same as Residential Address
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.1 House/Block/Lot No.</label>
                <input name="permanent_house_block_lot" value={formData.permanent_house_block_lot} onChange={handleChange} placeholder="Enter house/block/lot number" maxLength={getFieldLimit('permanent_house_block_lot')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.2 Street</label>
                <input name="permanent_street" value={formData.permanent_street} onChange={handleChange} placeholder="Enter street name" maxLength={getFieldLimit('permanent_street')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.3 Subdivision/Village</label>
                <input name="permanent_subdivision_village" value={formData.permanent_subdivision_village} onChange={handleChange} placeholder="Enter subdivision or village name" maxLength={getFieldLimit('permanent_subdivision_village')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.4 Barangay</label>
                <input name="permanent_barangay" value={formData.permanent_barangay} onChange={handleChange} placeholder="Enter barangay name" maxLength={getFieldLimit('permanent_barangay')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.5 City/Municipality</label>
                <input name="permanent_city_municipality" value={formData.permanent_city_municipality} onChange={handleChange} placeholder="Enter city or municipality" maxLength={getFieldLimit('permanent_city_municipality')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.6 Province</label>
                <input name="permanent_province" value={formData.permanent_province} onChange={handleChange} placeholder="Enter province" maxLength={getFieldLimit('permanent_province')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">18.7 ZIP CODE</label>
                <input name="permanent_zip_code" value={formData.permanent_zip_code} onChange={handleChange} placeholder="Enter ZIP code" maxLength={getFieldLimit('permanent_zip_code')} className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">19. TELEPHONE NO.</label>
            <input type="text" name="telephone" value={formData.telephone} onChange={handleChange} maxLength={getFieldLimit('telephone')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">20. MOBILE NO.</label>
            <input type="text" name="mobile" value={formData.mobile} onChange={handleChange} maxLength={getFieldLimit('mobile')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">21. E-MAIL ADDRESS</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} maxLength={getFieldLimit('email')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </section>

      {/* II. FAMILY BACKGROUND */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">II</span>
          FAMILY BACKGROUND
        </h3>
        
        {/* Family Information - Horizontal Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left Column: Spouse and Parents Information */}
          <div className="space-y-6">
            {/* Spouse Information */}
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">22. SPOUSE'S INFORMATION</h4>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.1 Surname</label>
                  <input 
                    name="spouse_surname" 
                    value={formData.spouse_surname} 
                    onChange={handleChange} 
                    placeholder="Enter surname" 
                    maxLength={getFieldLimit('spouse_surname')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.2 First Name</label>
                  <input 
                    name="spouse_firstname" 
                    value={formData.spouse_firstname} 
                    onChange={handleChange} 
                    placeholder="Enter first name" 
                    maxLength={getFieldLimit('spouse_firstname')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.3 Middle Name</label>
                  <input 
                    name="spouse_middlename" 
                    value={formData.spouse_middlename} 
                    onChange={handleChange} 
                    placeholder="Enter middle name" 
                    maxLength={getFieldLimit('spouse_middlename')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.4 Extension</label>
                  <input 
                    name="spouse_extension" 
                    value={formData.spouse_extension} 
                    onChange={handleChange} 
                    placeholder="Enter extension (Jr., Sr., III, etc.)" 
                    maxLength={getFieldLimit('spouse_extension')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.5 Occupation</label>
                  <input 
                    name="spouse_occupation" 
                    value={formData.spouse_occupation} 
                    onChange={handleChange} 
                    placeholder="Enter occupation" 
                    maxLength={getFieldLimit('spouse_occupation')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.6 Employer/Business Name</label>
                  <input 
                    name="spouse_employer_business_name" 
                    value={formData.spouse_employer_business_name} 
                    onChange={handleChange} 
                    placeholder="Enter employer or business name" 
                    maxLength={getFieldLimit('spouse_employer_business_name')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.7 Business Address</label>
                  <input 
                    name="spouse_business_address" 
                    value={formData.spouse_business_address} 
                    onChange={handleChange} 
                    placeholder="Enter business address" 
                    maxLength={getFieldLimit('spouse_business_address')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">22.8 Telephone</label>
                  <input 
                    name="spouse_telephone" 
                    value={formData.spouse_telephone} 
                    onChange={handleChange} 
                    placeholder="Enter telephone number" 
                    maxLength={getFieldLimit('spouse_telephone')}
                    disabled={formData.civil_status === 'Single'}
                    className={`px-3 py-2 border border-gray-300 rounded-lg w-full ${formData.civil_status === 'Single' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} 
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Children Information */}
          <div id="children-section">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">23. CHILDREN</h4>
            {children.map((child, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[3fr_1fr_auto] gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input 
                    name={`children[${index}].full_name`} 
                    value={child.full_name} 
                    onChange={(e) => updateChild(index, 'full_name', e.target.value)}
                    placeholder="Enter child's full name" 
                    maxLength={getFieldLimit('children_full_name')}
                    className="px-3 py-2 border border-gray-300 rounded-lg w-full" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input 
                    name={`children[${index}].date_of_birth`} 
                    type="date" 
                    value={child.date_of_birth} 
                    onChange={(e) => updateChild(index, 'date_of_birth', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg w-full" 
                  />
                </div>
                <div className="flex items-end justify-center">
                  <button 
                    type="button" 
                    onClick={() => removeChild(index)} 
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors w-12"
                    title="Remove child"
                  >
                    <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addChild} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
              Add Child
            </button>
          </div>
        </div>

        {/* Father and Mother Information - Horizontal Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Father's Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">24. FATHER'S INFORMATION</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">24.1 Surname</label>
                <input name="father_surname" value={formData.father_surname} onChange={handleChange} placeholder="Enter father's surname" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">24.2 First Name</label>
                  <input name="father_firstname" value={formData.father_firstname} onChange={handleChange} placeholder="Enter father's first name" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">24.4 Extension</label>
                  <input name="father_extension" value={formData.father_extension} onChange={handleChange} placeholder="Enter extension (Jr., Sr., III, etc.)" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">24.3 Middle Name</label>
                <input name="father_middlename" value={formData.father_middlename} onChange={handleChange} placeholder="Enter father's middle name" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
            </div>
          </div>

          {/* Mother's Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">25. MOTHER'S MAIDEN NAME</h4>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">25.1 Surname</label>
                <input name="mother_surname" value={formData.mother_surname} onChange={handleChange} placeholder="Enter mother's maiden surname" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">25.2 First Name</label>
                <input name="mother_firstname" value={formData.mother_firstname} onChange={handleChange} placeholder="Enter mother's first name" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">25.3 Middle Name</label>
                <input name="mother_middlename" value={formData.mother_middlename} onChange={handleChange} placeholder="Enter mother's middle name" className="px-3 py-2 border border-gray-300 rounded-lg w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* III. EDUCATIONAL BACKGROUND */}
      <section id="education-section" className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">III</span>
          EDUCATIONAL BACKGROUND
        </h3>
        
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">26. EDUCATION LEVELS</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '11%' }} /> {/* LEVEL */}
                <col style={{ width: '16%' }} /> {/* NAME OF SCHOOL */}
                <col style={{ width: '15%' }} /> {/* DEGREE/COURSE */}
                <col style={{ width: '15%' }} /> {/* PERIOD */}
                <col style={{ width: '12%' }} /> {/* HIGHEST LEVEL/UNITS */}
                <col style={{ width: '12%' }} /> {/* YEAR */}
                <col style={{ width: '20%' }} /> {/* SCHOLARSHIP/HONORS */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('LEVEL', 10)}`}>LEVEL</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('NAME OF SCHOOL', 20)}`}>NAME OF SCHOOL</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('DEGREE/COURSE', 20)}`}>DEGREE/COURSE</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('PERIOD', 10)}`}>PERIOD</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('HIGHEST LEVEL/UNITS', 7)}`}>HIGHEST LEVEL /UNITS</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('YEAR', 8)}`}>YEAR</th>
                  <th className={`border border-gray-300 px-4 py-2 text-left ${getHeaderFontSize('SCHOLARSHIP/HONORS', 20)}`}>SCHOLARSHIP/HONORS</th>
                </tr>
              </thead>
              <tbody>
                {normalizeEducationOrder(education).map((edu, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2 font-medium">{edu.level}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        name={`education[${index}].school_name`} 
                        value={edu.school_name} 
                        onChange={(e) => updateEducation(index, 'school_name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        name={`education[${index}].degree_course`} 
                        value={edu.degree_course} 
                        onChange={(e) => updateEducation(index, 'degree_course', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <div className="flex flex-col space-y-1">
                        <input 
                          name={`education[${index}].period_from`} 
                          type="date" 
                          value={edu.period_from} 
                          onChange={(e) => updateEducation(index, 'period_from', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          placeholder="From"
                          style={{ fontSize: '12px' }}
                        />
                        <input 
                          name={`education[${index}].period_to`} 
                          type="date" 
                          value={edu.period_to} 
                          onChange={(e) => updateEducation(index, 'period_to', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          placeholder="To"
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`education[${index}].highest_level_units`} 
                        value={edu.highest_level_units} 
                        onChange={(e) => updateEducation(index, 'highest_level_units', e.target.value)}
                        className={getTextClasses(edu.highest_level_units, true)}
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`education[${index}].year_graduated`} 
                        type="number" 
                        value={edu.year_graduated} 
                        onChange={(e) => updateEducation(index, 'year_graduated', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        min="1900"
                        max="2100"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        name={`education[${index}].scholarship_honors`} 
                        value={edu.scholarship_honors} 
                        onChange={(e) => updateEducation(index, 'scholarship_honors', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
        </div>
      </section>
    </div>
  );

  const renderPage2 = () => (
    <div className="space-y-8">
      {/* IV. CIVIL SERVICE ELIGIBILITY */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-orange-100 text-orange-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">IV</span>
          CIVIL SERVICE ELIGIBILITY
        </h3>
        
        <div id="eligibility-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">27. ELIGIBILITY RECORDS</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '15%' }} /> {/* ELIGIBILITY TYPE */}
                <col style={{ width: '10%' }} /> {/* RATING */}
                <col style={{ width: '15%' }} /> {/* DATE OF EXAMINATION */}
                <col style={{ width: '20%' }} /> {/* PLACE OF EXAMINATION */}
                <col style={{ width: '15%' }} /> {/* LICENSE NUMBER */}
                <col style={{ width: '15%' }} /> {/* DATE OF VALIDITY */}
                <col style={{ width: '5%' }} /> {/* ACTION */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">ELIGIBILITY TYPE</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">RATING</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">DATE OF EXAMINATION</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">PLACE OF EXAMINATION</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">LICENSE NUMBER</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">DATE OF VALIDITY</th>
                  <th className="border border-gray-300 px-4 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {civilServiceEligibility.map((eligibility, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">
                      <select 
                        name={`civil_service_eligibility[${index}].eligibility_type`} 
                        value={eligibility.eligibility_type} 
                        onChange={(e) => updateEligibility(index, 'eligibility_type', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Eligibility Type</option>
                        {loadingLookupData ? (
                          <option value="" disabled>Loading eligibility types...</option>
                        ) : eligibilityTypes.length > 0 ? (
                          eligibilityTypes.map(type => (
                            <option key={type.id} value={type.eligibility_type}>
                              {type.eligibility_type}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No eligibility types available</option>
                        )}
                      </select>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`civil_service_eligibility[${index}].rating`} 
                        value={eligibility.rating} 
                        onChange={(e) => updateEligibility(index, 'rating', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`civil_service_eligibility[${index}].date_of_examination`} 
                        type="date" 
                        value={eligibility.date_of_examination ? formatDateForInput(eligibility.date_of_examination) : ''} 
                        onChange={(e) => updateEligibility(index, 'date_of_examination', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`civil_service_eligibility[${index}].place_of_examination`} 
                        value={eligibility.place_of_examination} 
                        onChange={(e) => updateEligibility(index, 'place_of_examination', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`civil_service_eligibility[${index}].license_number`} 
                        value={eligibility.license_number} 
                        onChange={(e) => updateEligibility(index, 'license_number', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        name={`civil_service_eligibility[${index}].date_of_validity`} 
                        type="date" 
                        value={eligibility.date_of_validity ? formatDateForInput(eligibility.date_of_validity) : ''} 
                        onChange={(e) => updateEligibility(index, 'date_of_validity', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button 
                        type="button" 
                        onClick={() => removeEligibility(index)} 
                        className="p-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                        title="Remove eligibility"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addEligibility} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
            Add Eligibility
          </button>
         
        </div>
      </section>

      {/* V. WORK EXPERIENCE */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-red-100 text-red-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">V</span>
          WORK EXPERIENCE
        </h3>
        
        <p className="text-sm text-gray-600 mb-4">
          (Include private employment. Start from your recent work) Description of duties should be indicated in the attached Work Experience sheet.
        </p>
        
        <div id="work-experience-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">28. WORK HISTORY</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '15%' }} /> {/* FROM - narrow for dates */}
                <col style={{ width: '15%' }} /> {/* TO - narrow for dates */}
                <col style={{ width: '19%' }} /> {/* POSITION TITLE - wider for job titles */}
                <col style={{ width: '19%' }} /> {/* DEPARTMENT/AGENCY/COMPANY - medium width */}
                <col style={{ width: '11%' }} /> {/* MONTHLY SALARY - narrow for numbers */}
                <col style={{ width: '9%' }} /> {/* SALARY/GRADE/STEP - narrow */}
                <col style={{ width: '15%' }} /> {/* STATUS OF APPOINTMENT - medium */}
                <col style={{ width: '10%' }} /> {/* GOV'T SERVICE - narrow for Y/N */}
                <col style={{ width: '4%' }} /> {/* ACTION - narrow for button */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">FROM</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">TO</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">POSITION TITLE</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">DEPARTMENT /AGENCY /COMPANY</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">MONTHLY SALARY</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">SALARY /GRADE /STEP</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">STATUS OF APPOINTMENT</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words">GOV'T SERVICE</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-sm whitespace-normal break-words"></th>
                </tr>
              </thead>
              <tbody>
                {workExperience.map((work, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-2 py-2">
                      <input 
                        name={`work_experience[${index}].date_from`} 
                        type="date" 
                        value={work.date_from ? formatDateForInput(work.date_from) : ''} 
                        onChange={(e) => updateWorkExperience(index, 'date_from', e.target.value)}
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="flex flex-col space-y-1">
                        {/* Show Present checkbox if this row is present OR if no other row is present */}
                        {(work.is_present === true || !workExperience.some((exp, i) => i !== index && exp.is_present === true)) && (
                          <label className="flex items-center text-xs whitespace-nowrap">
                            <input 
                              type="checkbox" 
                              checked={work.is_present === true} 
                              onChange={(e) => updateWorkExperience(index, 'is_present', e.target.checked)}
                              className="mr-1"
                            />
                            Present
                          </label>
                        )}
                        <input 
                          name={`work_experience[${index}].date_to`} 
                          type="date" 
                          value={work.is_present === true ? 
                            (work.date_to ? formatDateForInput(work.date_to) : new Date().toISOString().split('T')[0]) : 
                            (work.date_to && work.date_to !== '0' && work.date_to !== '0000-00-00' ? formatDateForInput(work.date_to) : '')
                          } 
                          onChange={(e) => updateWorkExperience(index, 'date_to', e.target.value)}
                          disabled={work.is_present === true}
                          className="w-full px-1 py-1 border border-gray-300 rounded text-xs disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <textarea 
                        name={`work_experience[${index}].position_title`} 
                        value={work.position_title} 
                        onChange={(e) => updateWorkExperience(index, 'position_title', e.target.value)}
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <textarea 
                        name={`work_experience[${index}].department_agency_company`} 
                        value={work.department_agency_company} 
                        onChange={(e) => updateWorkExperience(index, 'department_agency_company', e.target.value)}
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <input 
                        name={`work_experience[${index}].monthly_salary`} 
                        type="number" 
                        step="0.01"
                        value={work.monthly_salary} 
                        onChange={(e) => updateWorkExperience(index, 'monthly_salary', e.target.value)}
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <input 
                        name={`work_experience[${index}].salary_grade_step`} 
                        value={work.salary_grade_step} 
                        onChange={(e) => updateWorkExperience(index, 'salary_grade_step', e.target.value)}
                        placeholder="00-0"
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <select 
                        name={`work_experience[${index}].status_of_appointment`} 
                        value={work.status_of_appointment} 
                        onChange={(e) => updateWorkExperience(index, 'status_of_appointment', e.target.value)}
                        className="w-full px-1 py-1 border border-gray-300 rounded text-xs"
                      >
                        <option value="">Select Status</option>
                        <option value="Permanent">Permanent</option>
                        <option value="Casual">Casual</option>
                        <option value="Contract">Contract</option>
                        <option value="Job Order">Job Order</option>
                        <option value="Provisionary">Provisionary</option>
                        <option value="Temporary">Temporary</option>
                      </select>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="flex space-x-1">
                        <label className="flex items-center text-xs">
                          <input 
                            type="radio" 
                            name={`work_experience[${index}].government_service`} 
                            value="Y" 
                            checked={work.government_service === 'Y'} 
                            onChange={(e) => updateWorkExperience(index, 'government_service', e.target.value)}
                            className="mr-1"
                          />
                          Y
                        </label>
                        <label className="flex items-center text-xs">
                          <input 
                            type="radio" 
                            name={`work_experience[${index}].government_service`} 
                            value="N" 
                            checked={work.government_service === 'N'} 
                            onChange={(e) => updateWorkExperience(index, 'government_service', e.target.value)}
                            className="mr-1"
                          />
                          N
                        </label>
                      </div>
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <button 
                        type="button" 
                        onClick={() => removeWorkExperience(index)} 
                        className="p-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
                        title="Remove work experience"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addWorkExperience} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
            Add Work Experience
          </button>
        
        </div>
      </section>
    </div>
  );

  const renderPage3 = () => (
    <div className="space-y-8">
      {/* VI. VOLUNTARY WORK */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-teal-100 text-teal-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">VI</span>
          VOLUNTARY WORK OR INVOLVEMENT IN CIVIC/NON-GOVERNMENT/PEOPLE/VOLUNTARY ORGANIZATION/S
        </h3>
        
        <div id="voluntary-work-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">29. VOLUNTARY WORK RECORDS</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '26%' }} /> {/* NAME & ADDRESS OF ORGANIZATION */}
                <col style={{ width: '15%' }} /> {/* FROM */}
                <col style={{ width: '15%' }} /> {/* TO */}
                <col style={{ width: '10%' }} /> {/* NUMBER OF HOURS */}
                <col style={{ width: '25%' }} /> {/* POSITION/NATURE OF WORK */}
                <col style={{ width: '6%' }} /> {/* ACTION */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">NAME/ADDRESS OF ORG.</th>                
                  <th className="border border-gray-300 px-4 py-2 text-left">FROM</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">TO</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">NUMBER OF HOURS</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">POSITION/NATURE OF WORK</th>
                  <th className="border border-gray-300 px-4 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {voluntaryWork.map((work, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        value={work.organization_name_address} 
                        onChange={(e) => updateVoluntaryWork(index, 'organization_name_address', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="date" 
                        value={work.date_from ? formatDateForInput(work.date_from) : ''} 
                        onChange={(e) => updateVoluntaryWork(index, 'date_from', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="date" 
                        value={work.date_to ? formatDateForInput(work.date_to) : ''} 
                        onChange={(e) => updateVoluntaryWork(index, 'date_to', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="number" 
                        step="0.5"
                        value={work.number_of_hours} 
                        onChange={(e) => updateVoluntaryWork(index, 'number_of_hours', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        value={work.position_nature_of_work} 
                        onChange={(e) => updateVoluntaryWork(index, 'position_nature_of_work', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button 
                        type="button" 
                        onClick={() => removeVoluntaryWork(index)} 
                        className="p-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                        title="Remove voluntary work"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addVoluntaryWork} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
            Add Voluntary Work
          </button>
        </div>
      </section>

      {/* VII. LEARNING & DEVELOPMENT */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-indigo-100 text-indigo-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">VII</span>
          LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS ATTENDED
        </h3>
        
        <div id="training-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">30. TRAINING RECORDS</h4>
          <p className="text-sm text-gray-600 mb-4">(Start from the most recent L&D/training program and include only the relevant L&D/training taken for the last five (5) years for Division Chief/Executive/Managerial positions)</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '20%' }} /> {/* TITLE OF TRAINING */}
                <col style={{ width: '16%' }} /> {/* FROM */}
                <col style={{ width: '16%' }} /> {/* TO */}
                <col style={{ width: '10%' }} /> {/* NUMBER OF HOURS */}
                <col style={{ width: '15%' }} /> {/* TYPE OF L&D */}
                <col style={{ width: '18%' }} /> {/* CONDUCTED/SPONSORED BY */}
                <col style={{ width: '6%' }} /> {/* ACTION */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left">TITLE OF TRAINING</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">FROM</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">TO</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">NUMBER OF HOURS</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">TYPE OF L&D</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">CONDUCTED /SPONSORED BY</th>
                  <th className="border border-gray-300 px-4 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((training, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        value={training.training_title} 
                        onChange={(e) => updateTraining(index, 'training_title', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="date" 
                        value={training.date_from ? formatDateForInput(training.date_from) : ''} 
                        onChange={(e) => updateTraining(index, 'date_from', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="date" 
                        value={training.date_to ? formatDateForInput(training.date_to) : ''} 
                        onChange={(e) => updateTraining(index, 'date_to', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="number" 
                        step="0.5"
                        value={training.number_of_hours} 
                        onChange={(e) => updateTraining(index, 'number_of_hours', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <input 
                        type="text"
                        value={training.type_of_ld} 
                        onChange={(e) => updateTraining(index, 'type_of_ld', e.target.value)}
                        placeholder="e.g. Managerial, Technical"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea 
                        value={training.conducted_sponsored_by} 
                        onChange={(e) => updateTraining(index, 'conducted_sponsored_by', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button 
                        type="button" 
                        onClick={() => removeTraining(index)} 
                        className="p-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                        title="Remove training"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addTraining} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
            Add Training
          </button>
        </div>
      </section>

      {/* VIII. OTHER INFORMATION */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-pink-100 text-pink-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">VIII</span>
          OTHER INFORMATION
        </h3>
        
        {/* Page 3 Sections - Horizontal Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Special Skills and Hobbies */}
          <div id="skills-section" className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">31. SPECIAL SKILLS AND HOBBIES</h4>
            {skills.map((skill, index) => (
              <div key={index} className="flex space-x-2 mb-2">
                <textarea 
                  value={skill.skill_hobby} 
                  onChange={(e) => updateSkill(index, e.target.value)}
                  placeholder="e.g. Computer Programming, Playing Guitar"
                  rows="2"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical"
                />
                <button 
                  type="button" 
                  onClick={() => removeSkill(index)} 
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  title="Remove skill/hobby"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addSkill} className="mt-2 w-full px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
              Add Skill/Hobby
            </button>
          </div>

          {/* Non-Academic Distinctions */}
          <div id="recognition-section" className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">32. NON-ACADEMIC DISTINCTIONS/RECOGNITION</h4>
            {recognitions.map((recog, index) => (
              <div key={index} className="flex space-x-2 mb-2">
                <textarea 
                  value={recog.recognition} 
                  onChange={(e) => updateRecognition(index, e.target.value)}
                  placeholder="e.g. Best Employee Award 2023"
                  rows="2"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical"
                />
                <button 
                  type="button" 
                  onClick={() => removeRecognition(index)} 
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  title="Remove recognition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addRecognition} className="mt-2 w-full px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
              Add Recognition
            </button>
          </div>

          {/* Membership in Associations */}
          <div id="membership-section" className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">33. MEMBERSHIP IN ASSOCIATION/ORGANIZATION</h4>
            {memberships.map((member, index) => (
              <div key={index} className="flex space-x-2 mb-2">
                <textarea 
                  value={member.organization} 
                  onChange={(e) => updateMembership(index, e.target.value)}
                  placeholder="e.g. Philippine Computer Society"
                  rows="2"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical"
                />
                <button 
                  type="button" 
                  onClick={() => removeMembership(index)} 
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  title="Remove membership"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addMembership} className="mt-2 w-full px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
              Add Membership
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  // Signature Canvas Component
  const SignatureCanvas = () => {
    const canvasRef = React.useRef(null);
    const [isDrawing, setIsDrawing] = React.useState(false);
    const saveTimeoutRef = React.useRef(null);

    // Force reset canvas context to ensure black strokes
    const forceResetCanvas = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // Clear and reset everything
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        console.log('🎨 Canvas force reset - stroke style:', ctx.strokeStyle);
      }
    };

    // Initialize canvas context
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'black'; // Black signature
        ctx.fillStyle = 'white'; // White background
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        console.log('🎨 Canvas initialized with stroke style:', ctx.strokeStyle);
      }
    }, []);

    // Load existing signature when signatureData changes
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas && signatureData) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Reset stroke style after loading image
          ctx.strokeStyle = 'black';
          ctx.fillStyle = 'white';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalCompositeOperation = 'source-over';
        };
        img.src = signatureData;
      }
    }, [signatureData]);

    // Cleanup timeout on unmount
    React.useEffect(() => {
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, []);

    const getEventPos = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      if (e.touches && e.touches[0]) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      } else {
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
      }
    };

    const startDrawing = (e) => {
      e.preventDefault();
      
      // Clear any pending auto-save timeout when starting a new stroke
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const pos = getEventPos(e);
      
      // Set drawing properties without resetting the canvas
      ctx.strokeStyle = 'black';
      ctx.fillStyle = 'white';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      
      // Debug: Log the stroke style to verify it's set correctly
      console.log('🎨 Starting new stroke with style:', ctx.strokeStyle);
      
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setIsDrawing(true);
    };

    const draw = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const pos = getEventPos(e);
      
      // Ensure stroke properties are maintained (only set if they might have changed)
      if (ctx.strokeStyle !== 'black') {
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
      }
      
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const compressSignature = (canvas) => {
      // Create a temporary canvas to compress the signature
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Set dimensions (maintain aspect ratio but limit size)
      const maxWidth = 400;
      const maxHeight = 150;
      tempCanvas.width = maxWidth;
      tempCanvas.height = maxHeight;
      
      // Draw the original canvas on the temp canvas
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(0, 0, maxWidth, maxHeight);
      tempCtx.drawImage(canvas, 0, 0, maxWidth, maxHeight);
      
      // Try different quality levels to get under 150KB
      let quality = 0.9;
      let dataUrl;
      let attempts = 0;
      const maxAttempts = 20;
      
      do {
        dataUrl = tempCanvas.toDataURL('image/png', quality);
        
        // More accurate size calculation
        const base64Size = dataUrl.split(',')[1] ? dataUrl.split(',')[1].length : 0;
        const sizeInKB = (base64Size * 0.75) / 1024;
        
        if (sizeInKB <= 150) {
          console.log(`✅ Signature compressed successfully: ${sizeInKB.toFixed(2)}KB, quality: ${quality}`);
          break;
        }
        
        quality -= 0.05; // Smaller steps for better quality
        attempts++;
      } while (quality > 0.1 && attempts < maxAttempts);
      
      if (attempts >= maxAttempts) {
        console.warn('⚠️ Could not compress signature below 150KB, using lowest quality available');
      }
      
      return dataUrl;
    };

    const stopDrawing = (e) => {
      e.preventDefault();
      if (isDrawing) {
        // Just end the current stroke, don't compress immediately
        // This allows multiple strokes to be drawn
        setIsDrawing(false);
        
        // Clear any existing timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // Auto-save after 1 second of inactivity
        saveTimeoutRef.current = setTimeout(() => {
          saveSignature();
        }, 1000);
      }
    };

    // Function to save/compress the complete signature
    const saveSignature = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const compressedSignature = compressSignature(canvas);
        setSignatureData(compressedSignature);
        console.log('🎨 Signature auto-saved');
      }
    };

    // Manual save function
    const manualSaveSignature = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveSignature();
    };

    const clearSignature = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Reset stroke style after clearing
      ctx.strokeStyle = 'black';
      ctx.fillStyle = 'white';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      
      console.log('🎨 Canvas cleared and stroke style reset to:', ctx.strokeStyle);
      setSignatureData('');
    };

    return (
      <div className="border border-gray-300 rounded-lg p-4">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="border border-gray-300 bg-white cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ 
            touchAction: 'none',
            backgroundColor: 'white',
            display: 'block'
          }}
        />
        <div className="mt-2 flex space-x-2">
          <button
            type="button"
            onClick={manualSaveSignature}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            Save Signature
          </button>
          <button
            type="button"
            onClick={clearSignature}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Clear Signature
          </button>
          <button
            type="button"
            onClick={forceResetCanvas}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Reset Canvas
          </button>
        </div>
      </div>
    );
  };

  const renderPage4 = () => {
    console.log('🔍 [PDS] Current declarations state in renderPage4:', declarations);
    return (
    <div className="space-y-8">
      {/* IX. DECLARATIONS */}
      <section id="declarations-section" className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-yellow-100 text-yellow-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">IX</span>
          DECLARATIONS
        </h3>
        
        <p className="text-sm text-gray-700 mb-6 italic">
          Please answer the following questions with complete honesty. Any misrepresentation made in this document may cause the filing of administrative/criminal case/s against you.
        </p>

        {/* Question 34 - Section Title (No Radio Button) */}
        <div className="mb-6 p-4 bg-gray-50 border-l-4 border-blue-500">
          <p className="text-sm font-semibold text-gray-900">
            34. Are you related by consanguinity or affinity to the appointing or recommending authority, or to the chief of bureau or office or to the person who has immediate supervision over you in the Office, Bureau or Department where you will be appointed,
          </p>
        </div>

        <div className="space-y-4">
          {/* Question 34a */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              a. within the third degree?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfour_a"
                    value="true"
                    checked={declarations.thirtyfour_a === true}
                    onChange={() => handleDeclarationToggle('thirtyfour_a', true)}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfour_a"
                    value="false"
                    checked={declarations.thirtyfour_a === false}
                    onChange={() => handleDeclarationToggle('thirtyfour_a', false)}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
            </div>
          </div>

          {/* Question 34b */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              b. within the fourth degree? (for Local Government Unit - Career Employees)
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfour_b"
                    value="true"
                    checked={declarations.thirtyfour_b === true}
                    onChange={() => handleDeclarationToggle('thirtyfour_b', true, ['thirtyfour_b_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfour_b"
                    value="false"
                    checked={declarations.thirtyfour_b === false}
                    onChange={() => handleDeclarationToggle('thirtyfour_b', false, ['thirtyfour_b_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyfour_b && (
                <input
                  type="text"
                  name="thirtyfour_b_details"
                  value={declarations.thirtyfour_b_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 35a */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              35a. Have you ever been found guilty of any administrative offense?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfive_a"
                    value="true"
                    checked={declarations.thirtyfive_a === true}
                    onChange={() => handleDeclarationToggle('thirtyfive_a', true, ['thirtyfive_a_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfive_a"
                    value="false"
                    checked={declarations.thirtyfive_a === false}
                    onChange={() => handleDeclarationToggle('thirtyfive_a', false, ['thirtyfive_a_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyfive_a && (
                <input
                  type="text"
                  name="thirtyfive_a_details"
                  value={declarations.thirtyfive_a_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 35b */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              35b. Have you been criminally charged before any court?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfive_b"
                    value="true"
                    checked={declarations.thirtyfive_b === true}
                    onChange={() => handleDeclarationToggle('thirtyfive_b', true, ['thirtyfive_datefiled', 'thirtyfive_statuses'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyfive_b"
                    value="false"
                    checked={declarations.thirtyfive_b === false}
                    onChange={() => handleDeclarationToggle('thirtyfive_b', false, ['thirtyfive_datefiled', 'thirtyfive_statuses'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyfive_b && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    type="date"
                    name="thirtyfive_datefiled"
                    value={declarations.thirtyfive_datefiled || ''}
                    onChange={handleDeclarationChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    name="thirtyfive_statuses"
                    value={declarations.thirtyfive_statuses}
                    onChange={handleDeclarationChange}
                    placeholder="Status of Case/s:"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Question 36 */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              36. Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation by any court or tribunal?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtysix"
                    value="true"
                    checked={declarations.thirtysix === true}
                    onChange={() => handleDeclarationToggle('thirtysix', true, ['thirtysix_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtysix"
                    value="false"
                    checked={declarations.thirtysix === false}
                    onChange={() => handleDeclarationToggle('thirtysix', false, ['thirtysix_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtysix && (
                <input
                  type="text"
                  name="thirtysix_details"
                  value={declarations.thirtysix_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 37 */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              37. Have you ever been separated from the service in any of the following modes: resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract or phased out (abolition) in the public or private sector?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyseven"
                    value="true"
                    checked={declarations.thirtyseven === true}
                    onChange={() => handleDeclarationToggle('thirtyseven', true, ['thirtyseven_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyseven"
                    value="false"
                    checked={declarations.thirtyseven === false}
                    onChange={() => handleDeclarationToggle('thirtyseven', false, ['thirtyseven_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyseven && (
                <input
                  type="text"
                  name="thirtyseven_details"
                  value={declarations.thirtyseven_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 38a */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              38a. Have you ever been a candidate in a national or local election held within the last year (except Barangay election)?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyeight_a"
                    value="true"
                    checked={declarations.thirtyeight_a === true}
                    onChange={() => handleDeclarationToggle('thirtyeight_a', true, ['thirtyeight_a_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyeight_a"
                    value="false"
                    checked={declarations.thirtyeight_a === false}
                    onChange={() => handleDeclarationToggle('thirtyeight_a', false, ['thirtyeight_a_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyeight_a && (
                <input
                  type="text"
                  name="thirtyeight_a_details"
                  value={declarations.thirtyeight_a_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 38b */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              38b. Have you resigned from the government service during the three (3)-month period before the last election to promote/actively campaign for a national or local candidate?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyeight_b"
                    value="true"
                    checked={declarations.thirtyeight_b === true}
                    onChange={() => handleDeclarationToggle('thirtyeight_b', true, ['thirtyeight_b_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtyeight_b"
                    value="false"
                    checked={declarations.thirtyeight_b === false}
                    onChange={() => handleDeclarationToggle('thirtyeight_b', false, ['thirtyeight_b_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtyeight_b && (
                <input
                  type="text"
                  name="thirtyeight_b_details"
                  value={declarations.thirtyeight_b_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 39 */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              39. Have you acquired the status of an immigrant or permanent resident of another country?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtynine"
                    value="true"
                    checked={declarations.thirtynine === true}
                    onChange={() => handleDeclarationToggle('thirtynine', true, ['thirtynine_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="thirtynine"
                    value="false"
                    checked={declarations.thirtynine === false}
                    onChange={() => handleDeclarationToggle('thirtynine', false, ['thirtynine_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.thirtynine && (
                <input
                  type="text"
                  name="thirtynine_details"
                  value={declarations.thirtynine_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, give details (country):"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>
        </div>

        {/* Question 40 - Section Title (No Radio Button) */}
        <div className="mb-6 p-4 bg-gray-50 border-l-4 border-blue-500">
          <p className="text-sm font-semibold text-gray-900">
            40. Pursuant to: (a) Indigenous People's Act (RA 8371); (b) Magna Carta for Disabled Persons (RA 7277); and (c) Solo Parents Welfare Act of 2000 (RA 8972), please answer the following items:
          </p>
        </div>

        <div className="space-y-4">
          {/* Question 40a */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              a. Are you a member of any indigenous group?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_a"
                    value="true"
                    checked={declarations.forty_a === true}
                    onChange={() => handleDeclarationToggle('forty_a', true, ['forty_a_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_a"
                    value="false"
                    checked={declarations.forty_a === false}
                    onChange={() => handleDeclarationToggle('forty_a', false, ['forty_a_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.forty_a && (
                <input
                  type="text"
                  name="forty_a_details"
                  value={declarations.forty_a_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, please specify:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 40b */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              b. Are you a person with disability?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_b"
                    value="true"
                    checked={declarations.forty_b === true}
                    onChange={() => handleDeclarationToggle('forty_b', true, ['forty_b_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_b"
                    value="false"
                    checked={declarations.forty_b === false}
                    onChange={() => handleDeclarationToggle('forty_b', false, ['forty_b_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.forty_b && (
                <input
                  type="text"
                  name="forty_b_details"
                  value={declarations.forty_b_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, please specify ID No:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>

          {/* Question 40c */}
          <div className="grid grid-cols-[2fr,1fr] gap-4 items-start">
            <div className="text-sm font-medium text-gray-900">
              c. Are you a solo parent?
            </div>
            <div>
              <div className="flex space-x-6 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_c"
                    value="true"
                    checked={declarations.forty_c === true}
                    onChange={() => handleDeclarationToggle('forty_c', true, ['forty_c_details'])}
                    className="mr-2"
                  />
                  YES
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="forty_c"
                    value="false"
                    checked={declarations.forty_c === false}
                    onChange={() => handleDeclarationToggle('forty_c', false, ['forty_c_details'])}
                    className="mr-2"
                  />
                  NO
                </label>
              </div>
              {declarations.forty_c && (
                <input
                  type="text"
                  name="forty_c_details"
                  value={declarations.forty_c_details}
                  onChange={handleDeclarationChange}
                  placeholder="If YES, please specify ID No:"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* X. REFERENCES */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <span className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">X</span>
            CHARACTER REFERENCES
          </div>
          <span className="text-sm font-normal text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
            {references.filter(ref => ref.reference_name && ref.reference_name.trim() !== '').length}/3 Required
          </span>
        </h3>
        
        <div id="references-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">41. REFERENCES (Person not related by consanguinity or affinity to applicant /appointee)</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '42%' }} /> {/* NAME */}
                <col style={{ width: '33%' }} /> {/* ADDRESS */}
                <col style={{ width: '20%' }} /> {/* TEL. NO. */}
                <col style={{ width: '6%' }} /> {/* ACTION */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">NAME</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">ADDRESS</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">TEL. NO.</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm"></th>
                </tr>
              </thead>
              <tbody>
                {references.map((ref, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 px-4 py-2">
                  <input
                    type="text"
                    value={ref.reference_name}
                    onChange={(e) => updateReference(index, 'reference_name', e.target.value)}
                    placeholder="Enter full name"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <textarea
                    value={ref.reference_address}
                    onChange={(e) => updateReference(index, 'reference_address', e.target.value)}
                    placeholder="Enter complete address"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-vertical"
                        rows="2"
                        style={{ fontSize: '12px' }}
                      />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                    <input
                      type="text"
                      value={ref.reference_tel_no}
                      onChange={(e) => updateReference(index, 'reference_tel_no', e.target.value)}
                      placeholder="Enter telephone number"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        style={{ fontSize: '12px' }}
                    />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                    <button 
                      type="button" 
                      onClick={() => removeReference(index)} 
                        className="p-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
                      title="Remove reference"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button 
            type="button" 
            onClick={addReference} 
            disabled={references.length >= 3}
            className={`mt-4 px-4 py-2 rounded-lg ${
              references.length >= 3 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {references.length >= 3 ? 'Maximum 3 References' : 'Add Reference'}
          </button>
        </div>
      </section>

      {/* XI. OATH & DECLARATION */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-gray-100 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">XI</span>
          OATH & DECLARATION
        </h3>
        
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-800 leading-relaxed">
            <strong>42. DECLARATION:</strong> I declare under oath that I have personally accomplished this Personal Data Sheet which is a true, correct and complete statement pursuant to the provisions of pertinent laws, rules and regulations of the Republic of the Philippines. I authorize the agency head/authorized representative to verify/validate the contents stated herein. I agree that any misrepresentation made in this document and its attachments shall cause the filing of administrative/criminal case/s against me.
          </p>
        </div>
      </section>

      {/* XII. GOVERNMENT IDs */}
      <section className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <span className="bg-cyan-100 text-cyan-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">XII</span>
            GOVERNMENT ISSUED ID
          </div>
          {governmentIds.length > 0 && governmentIds[0].government_issued_id && !isReplacingGovId && (
            <span className="text-sm font-normal text-green-600 bg-green-100 px-3 py-1 rounded-full">
              ✓ Active ID: {governmentIds[0].government_issued_id}
            </span>
          )}
          {isReplacingGovId && (
            <span className="text-sm font-normal text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
              ⚠️ Replacing ID - Fill all fields to accept changes
            </span>
          )}
        </h3>
        
        <div id="government-id-section">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">43. GOVERNMENT ISSUED ID</h4>
          <p className="text-sm text-gray-600 mb-4">(i.e. Passport, GSIS, SSS, PRC, Driver's License, etc.) PLEASE INDICATE ID Number and Date of Issuance</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 table-fixed">
              <colgroup>
                <col style={{ width: '30%' }} /> {/* GOVERNMENT ISSUED ID */}
                <col style={{ width: '25%' }} /> {/* ID NUMBER */}
                <col style={{ width: '20%' }} /> {/* DATE ISSUED */}
                <col style={{ width: '25%' }} /> {/* PLACE OF ISSUANCE */}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">GOVERNMENT ISSUED ID</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">ID NUMBER</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">DATE ISSUED</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm">PLACE OF ISSUANCE</th>
                </tr>
              </thead>
              <tbody>
            {governmentIds.map((id, index) => (
                  <tr key={index} className={isReplacingGovId ? 'bg-orange-50' : ''}>
                    <td className="border border-gray-300 px-4 py-2">
                <input
                  type="text"
                  value={id.government_issued_id}
                  onChange={(e) => updateGovernmentId(index, 'government_issued_id', e.target.value)}
                        placeholder="Enter Government ID"
                        className={`w-full px-2 py-1 border rounded text-xs ${
                    isReplacingGovId ? 'border-orange-300 focus:border-orange-500' : 'border-gray-300'
                  }`}
                        style={{ fontSize: '12px' }}
                  required={isReplacingGovId}
                />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                <input
                  type="text"
                  value={id.id_number}
                  onChange={(e) => updateGovernmentId(index, 'id_number', e.target.value)}
                        placeholder="Enter ID Number"
                        className={`w-full px-2 py-1 border rounded text-xs ${
                    isReplacingGovId ? 'border-orange-300 focus:border-orange-500' : 'border-gray-300'
                  }`}
                        style={{ fontSize: '12px' }}
                  required={isReplacingGovId}
                />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {console.log(`🔍 [Government ID] Date issued for ID ${index}:`, id.date_issued)}
                <input
                  type="date"
                        value={id.date_issued ? id.date_issued.split('T')[0] : ''}
                  onChange={(e) => updateGovernmentId(index, 'date_issued', e.target.value)}
                        placeholder="Select Date"
                        className={`w-full px-2 py-1 border rounded text-xs ${
                    isReplacingGovId ? 'border-orange-300 focus:border-orange-500' : 'border-gray-300'
                  }`}
                        style={{ fontSize: '12px' }}
                  required={isReplacingGovId}
                />
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                <input
                  type="text"
                  value={id.place_of_issuance}
                  onChange={(e) => updateGovernmentId(index, 'place_of_issuance', e.target.value)}
                        placeholder="Enter Place of Issuance"
                        className={`w-full px-2 py-1 border rounded text-xs ${
                    isReplacingGovId ? 'border-orange-300 focus:border-orange-500' : 'border-gray-300'
                  }`}
                        style={{ fontSize: '12px' }}
                  required={isReplacingGovId}
                />
                    </td>
                  </tr>
            ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex space-x-3">
            {console.log('🔍 [Government ID] Render - isReplacingGovId:', isReplacingGovId)}
            {console.log('🔍 [Government ID] Render - hasPendingGovIdChange:', hasPendingGovIdChange)}
            {console.log('🔍 [Government ID] Render - governmentIds:', governmentIds)}
            {!isReplacingGovId ? (
              <button 
                type="button" 
                onClick={addGovernmentId} 
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                {governmentIds.length > 0 && governmentIds[0].government_issued_id ? 'Replace Government ID' : 'Add Government ID'}
              </button>
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={() => {
                    console.log('🔍 [Government ID] Change Government ID button clicked');
                    acceptGovernmentIdChange();
                  }} 
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  Change Government ID
                </button>
                <button 
                  type="button" 
                  onClick={cancelGovernmentIdChange} 
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* XIII. SIGNATURE, PHOTO & THUMBMARK */}
      <section id="media-section" className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="bg-rose-100 text-rose-700 rounded-full w-8 h-8 flex items-center justify-center mr-3">XIII</span>
          SIGNATURE, PHOTO & THUMBMARK
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Signature Section */}
          <div id="signature-section">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">44. EMPLOYEE SIGNATURE</h4>
            {signatureData && (
              <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Signature loaded from saved record
                </p>
              </div>
            )}
            <p className="text-sm text-gray-600 mb-3">Draw your signature below or upload an image</p>
            <SignatureCanvas />
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Or Upload Signature Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSignatureUpload}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            {signatureData && (
              <div className="mt-4">
                <p className="text-sm text-gray-700 mb-2">Signature Preview:</p>
                <img src={signatureData} alt="Signature" className="border border-gray-300 rounded-lg max-w-full h-32 object-contain" />
              </div>
            )}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Accomplished</label>
              <input
                id="date-accomplished"
                type="date"
                value={dateAccomplished}
                onChange={(e) => setDateAccomplished(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Photo & Thumbmark Section */}
          <div>
            <div id="photo-section" className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">PHOTO (3.5cm x 4.5cm)</h4>
              {photoData && (
                <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Photo loaded from saved record
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-3">Upload passport-size photo</p>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              />
              {photoData && (
                <div className="mt-4">
                  <p className="text-sm text-gray-700 mb-2">Photo Preview:</p>
                  <img src={photoData} alt="Employee" className="border border-gray-300 rounded-lg w-32 h-40 object-cover" />
                </div>
              )}
            </div>

            <div id="thumbmark-section">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">RIGHT THUMBMARK</h4>
              {thumbmarkData && (
                <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Thumbmark loaded from saved record
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-3">Upload right thumbmark image</p>
              <input
                type="file"
                accept="image/*"
                onChange={handleThumbmarkUpload}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              />
              {thumbmarkData && (
                <div className="mt-4">
                  <p className="text-sm text-gray-700 mb-2">Thumbmark Preview:</p>
                  <img src={thumbmarkData} alt="Thumbmark" className="border border-gray-300 rounded-lg w-24 h-24 object-contain" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
  };

  if (pdsExists === false) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No PDS found</h2>
          <p className="text-gray-600 mb-6">We couldn't find your Personal Data Sheet. Click below to create one and start filling it out.</p>
          <button
            onClick={handleCreateInitialPDS}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create My PDS'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow p-6">
        {/* PDS Progress Status Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
          <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Personal Data Sheet (PDS)</h2>
              <p className="text-gray-600">Track your progress and complete missing information</p>
          </div>
          <button 
              onClick={onBack}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
              ← Back to DTR Check
          </button>
        </div>

          {/* Progress Bar */}
          <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">PDS Completeness</span>
          <span className="text-sm font-semibold text-blue-600">
            {(typeof completenessProgress === 'number' ? completenessProgress : 0).toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ${
              (completenessProgress || 0) >= 80 ? 'bg-green-500' :
              (completenessProgress || 0) >= 50 ? 'bg-yellow-500' :
              (completenessProgress || 0) >= 25 ? 'bg-orange-500' :
              'bg-red-500'
            }`}
            style={{ width: `${completenessProgress || 0}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {(completenessProgress || 0) < 25 ? 'Just getting started' :
           (completenessProgress || 0) < 50 ? 'Making progress' :
           (completenessProgress || 0) < 80 ? 'Almost there!' :
           (completenessProgress || 0) < 100 ? 'Nearly complete!' :
           'Complete!'}
        </p>
          </div>
        
        {/* Missing Fields Display */}
        {missingFields.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center mb-2">
              <svg className="w-4 h-4 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-yellow-800">
                Missing Fields ({missingFields.length})
              </span>
            </div>
            <div className={`overflow-y-auto ${showAllMissingFields ? 'max-h-64' : 'max-h-32'}`}>
              <div className="space-y-1">
                {(showAllMissingFields ? missingFields : missingFields.slice(0, 10)).map((missing, index) => (
                  <div key={index} className="text-xs text-yellow-700 flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2 flex-shrink-0"></span>
                    <span className="font-medium">{missing.section}:</span>
                    <button
                      onClick={() => focusOnField(missing)}
                      className="ml-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors duration-200"
                      title={`Click to focus on ${missing.field} field`}
                    >
                      {missing.field}
                    </button>
                  </div>
                ))}
                {missingFields.length > 10 && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setShowAllMissingFields(!showAllMissingFields)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors duration-200 font-medium"
                    >
                      {showAllMissingFields 
                        ? `Show Less (showing ${missingFields.length} of ${missingFields.length})`
                        : `Show More (${missingFields.length - 10} more fields)`
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Complete Status */}
        {missingFields.length === 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-green-800">
                  🎉 All required fields completed!
              </span>
            </div>
          </div>
        )}
      </div>

        {/* Retry Button for Failed Lookup Data */}
        {!loadingLookupData && bloodTypes.length === 0 && civilStatuses.length === 0 && eligibilityTypes.length === 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mx-6 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Lookup Data Not Available</p>
                  <p className="text-sm text-yellow-700">Unable to load data from HR201 database tables</p>
                </div>
              </div>
              <button
                onClick={retryFetchLookupData}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Modal Content */}
        <div className="p-6 space-y-6">

      {/* Page Navigation */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">PDS Pages</h3>
          <div className="flex space-x-2">
            {[1, 2, 3, 4].map((page) => (
              <button
                key={page}
                onClick={() => setActivePage(page)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  activePage === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Page {page}
                {' ✓'}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* Page Content */}
      <div className="min-h-screen">
        {activePage === 1 && renderPage1()}
        {activePage === 2 && renderPage2()}
        {activePage === 3 && renderPage3()}
        {activePage === 4 && renderPage4()}
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex space-x-3">
            {activePage > 1 && (
              <button
                onClick={() => setActivePage(activePage - 1)}
                disabled={isFormDisabled}
                className={`px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 ${isFormDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ← Previous Page
              </button>
            )}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => handleSubmit(true)}
              disabled={loading || isFormDisabled}
              className={`px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center space-x-2 ${isFormDisabled ? 'cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Save Draft</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => handleSubmit(false)}
              disabled={loading || isFormDisabled}
              className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2 ${isFormDisabled ? 'cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Save & Close</span>
                </>
              )}
            </button>
            
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print PDS</span>
            </button>
            
            {activePage < 4 && (
              <button
                onClick={() => setActivePage(activePage + 1)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Next Page →
              </button>
            )}
          </div>
        </div>
      </div>
        </div>
      </div>

      {/* MyPDS Print Preview Modal */}
      {isMyPdsPreviewOpen && (
        <div className="my-pds-print-overlay fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4 py-8">
          <style>{myPdsPrintStyles}</style>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-full overflow-hidden flex flex-col">
            <div className="no-print border-b px-6 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">PDS Print Preview</h3>
                  <p className="text-sm text-gray-500">Select a page or print the entire PDS.</p>
                </div>
                <button
                  onClick={() => setIsMyPdsPreviewOpen(false)}
                  className="px-3 py-2 text-gray-600 hover:text-gray-900"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setMyPdsPreviewPage(null)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    myPdsPreviewPage === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Pages
                </button>
                {[1, 2, 3, 4].map((page) => (
                  <button
                    key={page}
                    onClick={() => setMyPdsPreviewPage(page)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      myPdsPreviewPage === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Page {page}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Print
                </button>
                <button
                  onClick={() => setIsMyPdsPreviewOpen(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="print-scope flex-1 overflow-auto bg-gray-50 px-4 py-3">
              <MyPdsPrint
                formData={formData}
                children={children}
                education={education}
                civilServiceEligibility={civilServiceEligibility}
                workExperience={workExperience}
                voluntaryWork={voluntaryWork}
                trainings={trainings}
                skills={skills}
                recognitions={recognitions}
                memberships={memberships}
                declarations={declarations}
                references={references}
                governmentIds={governmentIds}
                signatureData={signatureData}
                photoData={photoData}
                thumbmarkData={thumbmarkData}
                dateAccomplished={dateAccomplished}
                pageNumber={myPdsPreviewPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Conversion Modal */}
      {showConversionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {conversionType === 'height' ? 'Height Converter' : 'Weight Converter'}
              </h3>
              <button
                onClick={closeConversionModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {conversionType === 'height' ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Convert height to meters</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                    <input
                      type="number"
                      value={conversionInputs.value}
                      onChange={(e) => updateConversionInput('value', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="5"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select
                      value={conversionInputs.unit}
                      onChange={(e) => updateConversionInput('unit', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ft">Feet (ft)</option>
                      <option value="cm">Centimeters (cm)</option>
                      <option value="in">Inches (in)</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={performConversion}
                  disabled={!conversionInputs.value || !conversionInputs.unit}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Convert to Meters
                </button>
                {conversionInputs.convertedValue && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Result: {conversionInputs.convertedValue} meters</strong>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Convert weight to kilograms</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                    <input
                      type="number"
                      value={conversionInputs.value}
                      onChange={(e) => updateConversionInput('value', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="150"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select
                      value={conversionInputs.unit}
                      onChange={(e) => updateConversionInput('unit', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="lbs">Pounds (lbs)</option>
                      <option value="g">Grams (g)</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={performConversion}
                  disabled={!conversionInputs.value || !conversionInputs.unit}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Convert to Kilograms
                </button>
                {conversionInputs.convertedValue && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Result: {conversionInputs.convertedValue} kilograms</strong>
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex space-x-3 mt-6">
              <button
                onClick={closeConversionModal}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={applyConversion}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={!conversionInputs.convertedValue}
              >
                Apply to Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdsDtrChecker;