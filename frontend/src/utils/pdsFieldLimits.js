/**
 * PDS Field Length Limits
 * Based on backend truncation limits and database schema constraints
 * Used by both PdsDtrChecker.jsx (self-service) and Pds.jsx (admin view)
 */

export const PDS_FIELD_LIMITS = {
  // Personal Information - Page 1
  cs_id_no: null, // No limit (CSC use only, disabled)
  surname: 100, // Estimated based on common database schemas
  firstname: 100,
  middlename: 100,
  name_extension: 10, // Jr., Sr., III, etc.
  place_of_birth: 200,
  height: 5, // Backend truncation: substring(0, 5)
  weight: 5, // Backend truncation: substring(0, 5)
  blood_type: 4, // Backend truncation: substring(0, 4)
  gsis: 20, // Backend truncation: substring(0, 20)
  pagibig: 20, // Backend truncation: substring(0, 20)
  philhealth: 20, // Backend truncation: substring(0, 20)
  sss: 20, // Backend truncation: substring(0, 20)
  tin: 20, // Backend truncation: substring(0, 20)
  agency_no: 20, // Backend truncation: substring(0, 20)
  dual_citizenship_type: 50,
  dual_citizenship_country: 100,
  
  // Address fields
  residential_house_block_lot: 100,
  residential_street: 200,
  residential_subdivision_village: 200,
  residential_barangay: 100,
  residential_city_municipality: 100,
  residential_province: 100,
  residential_zip_code: 10,
  permanent_house_block_lot: 100,
  permanent_street: 200,
  permanent_subdivision_village: 200,
  permanent_barangay: 100,
  permanent_city_municipality: 100,
  permanent_province: 100,
  permanent_zip_code: 10,
  
  // Contact Information
  telephone: 20,
  mobile: 20,
  email: 255, // Standard email field length
  
  // Family Background - Spouse
  spouse_surname: 50, // Backend truncation: substring(0, 50)
  spouse_firstname: 50, // Backend truncation: substring(0, 50)
  spouse_middlename: 50, // Backend truncation: substring(0, 50)
  spouse_extension: 10, // Backend truncation: substring(0, 10)
  spouse_occupation: 30, // Backend truncation: substring(0, 30)
  spouse_employer_business_name: 50, // Backend truncation: substring(0, 50)
  spouse_business_address: 100, // Backend truncation: substring(0, 100)
  spouse_telephone: 15, // Backend truncation: substring(0, 15)
  
  // Family Background - Parents
  father_surname: 100,
  father_firstname: 100,
  father_middlename: 100,
  father_extension: 10,
  mother_surname: 100,
  mother_firstname: 100,
  mother_middlename: 100,
  
  // Children
  children_full_name: 200,
  
  // Education
  education_level: 25, // Backend truncation: substring(0, 25)
  education_school_name: 25, // Backend truncation: substring(0, 25)
  education_degree_course: 50, // Backend truncation: substring(0, 50)
  education_highest_level_units: 15, // Backend truncation: substring(0, 15)
  education_scholarship_honors: 25, // Backend truncation: substring(0, 25)
  
  // Civil Service Eligibility
  eligibility_rating: 20,
  eligibility_place_of_examination: 200,
  eligibility_license_number: 50,
  
  // Work Experience
  work_experience_position_title: 200,
  work_experience_department_agency_company: 200,
  work_experience_salary_grade_step: 20,
  work_experience_status_of_appointment: 50,
  
  // Voluntary Work
  voluntary_work_organization_name_address: 500,
  voluntary_work_position_nature_of_work: 200,
  
  // Training
  training_title: 200,
  training_type_of_ld: 50,
  training_conducted_sponsored_by: 200,
  
  // Other Information
  skills_hobbies: 500,
  recognitions: 500,
  memberships: 200,
  
  // References
  reference_name: 200,
  reference_address: 500,
  reference_telephone: 20,
  
  // Government ID
  government_id_number: 50,
  government_id_place_of_issuance: 200,
  
  // Declarations
  declaration_details: 500, // For various declaration detail fields
};

/**
 * Get field limit for a given field name
 * @param {string} fieldName - The field name to get limit for
 * @returns {number|null} - The character limit or null if no limit
 */
export const getFieldLimit = (fieldName) => {
  return PDS_FIELD_LIMITS[fieldName] || null;
};

/**
 * Validate field value against its limit
 * @param {string} fieldName - The field name
 * @param {string} value - The field value
 * @returns {object} - { valid: boolean, error: string|null }
 */
export const validateFieldLength = (fieldName, value) => {
  const limit = getFieldLimit(fieldName);
  if (limit === null) {
    return { valid: true, error: null };
  }
  
  if (value && value.length > limit) {
    return {
      valid: false,
      error: `Maximum ${limit} characters allowed. Current: ${value.length} characters.`
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Get user-friendly field name for error messages
 * @param {string} fieldName - The field name
 * @returns {string} - User-friendly field name
 */
export const getFieldDisplayName = (fieldName) => {
  const displayNames = {
    surname: 'Surname',
    firstname: 'First Name',
    middlename: 'Middle Name',
    name_extension: 'Name Extension',
    place_of_birth: 'Place of Birth',
    gsis: 'GSIS ID No.',
    pagibig: 'PAG-IBIG ID No.',
    philhealth: 'PhilHealth No.',
    sss: 'SSS No.',
    tin: 'TIN No.',
    agency_no: 'Agency Employee No.',
    telephone: 'Telephone No.',
    mobile: 'Mobile No.',
    email: 'E-mail Address',
    spouse_surname: 'Spouse Surname',
    spouse_firstname: 'Spouse First Name',
    spouse_middlename: 'Spouse Middle Name',
    spouse_extension: 'Spouse Extension',
    spouse_occupation: 'Spouse Occupation',
    spouse_employer_business_name: 'Spouse Employer/Business Name',
    spouse_business_address: 'Spouse Business Address',
    spouse_telephone: 'Spouse Telephone',
    father_surname: 'Father Surname',
    father_firstname: 'Father First Name',
    father_middlename: 'Father Middle Name',
    father_extension: 'Father Extension',
    mother_surname: 'Mother Surname',
    mother_firstname: 'Mother First Name',
    mother_middlename: 'Mother Middle Name',
    education_school_name: 'School Name',
    education_degree_course: 'Degree/Course',
    education_scholarship_honors: 'Scholarship/Honors',
    eligibility_rating: 'Eligibility Rating',
    eligibility_place_of_examination: 'Place of Examination',
    eligibility_license_number: 'License Number',
    work_experience_position_title: 'Position Title',
    work_experience_department_agency_company: 'Department/Agency/Company',
    work_experience_salary_grade_step: 'Salary Grade/Step',
    voluntary_work_organization_name_address: 'Organization Name/Address',
    voluntary_work_position_nature_of_work: 'Position/Nature of Work',
    training_title: 'Training Title',
    training_conducted_sponsored_by: 'Conducted/Sponsored By',
    reference_name: 'Reference Name',
    reference_address: 'Reference Address',
    reference_telephone: 'Reference Telephone',
    government_id_number: 'Government ID Number',
    government_id_place_of_issuance: 'Place of Issuance',
  };
  
  return displayNames[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

