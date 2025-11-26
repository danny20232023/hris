import React from 'react';

const PdsPrintPage1 = ({ formData, children = [], education = [], displayValue, formatDate }) => {
  // Create array for 60 rows with row numbers
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);

  return (
    <div className="no-page-break">
      {/* Main 60x9 table structure */}
      <table className="pds-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '14%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header title */}
          <tr>
            <td colSpan="9" className="pds-header-main" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px', padding: '10px 0' }}>
              CS Form No. 212 - Revised 2017<br/>
              PERSONAL DATA SHEET
            </td>
          </tr>
          
          {/* Row 2: Warning */}
          <tr>
            <td colSpan="9" className="warning-text" style={{ fontSize: '12px', padding: '8px 0', fontWeight: 'bold' }}>
              WARNING: Ang misrepresentation made in the Personal Data Sheet and the Work Experience Sheet shall cause the filing of administrative/criminal case/s against the person concerned.
            </td>
          </tr>
          
          {/* Row 3: Instructions */}
          <tr>
            <td colSpan="9" className="instructions-text" style={{ fontSize: '11px', padding: '8px 0' }}>
              READ THE ATTACHED GUIDE TO FILLING OUT THE PERSONAL DATA SHEET (PDS) BEFORE ACCOMPLISHING THE PDS FORM
            </td>
          </tr>
          
          {/* Row 4: Guidelines */}
          <tr>
            <td colSpan="9" className="filling-guidelines" style={{ fontSize: '10px', padding: '8px 0' }}>
              Print legibly. Tick appropriate [✓]xes (☐) and use separate sheet if necessary. Indicate N/A if not applicable. DO NOT 1. CS ID No [ ] (Do not fill up. For CSC use only)
            </td>
          </tr>
          
          {/* Row 5: Section I Header */}
          <tr>
            <td colSpan="9" className="section-title" style={{ fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              I. PERSONAL INFORMATION
            </td>
          </tr>
          
          {/* Row 6: SURNAME */}
          <tr>
            <td className="field-label">2. SURNAME</td>
            <td className="field-value" colSpan="7">{displayValue(formData.surname)}</td>
            <td colSpan="1"></td>
          </tr>
          
          {/* Row 7: FIRST NAME and NAME EXTENSION */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value">{displayValue(formData.firstname)}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td className="field-label">NAME EXTENSION (JR., SR)</td>
            <td className="field-value" colspan="1">{displayValue(formData.name_extension)}</td>
            <td></td>
          </tr>
          
          {/* Row 8: MIDDLE NAME */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value" colSpan="2">{displayValue(formData.middlename)}</td>
            <td colSpan="6"></td>
          </tr>
          
          {/* Row 9: DATE OF BIRTH and CITIZENSHIP */}
          <tr>
            <td className="field-label">3. DATE OF BIRTH (mm/dd/yyyy)</td>
            <td className="field-value">{displayValue(formData.date_of_birth)}</td>
            <td></td>
            <td className="field-label">16. CITIZENSHIP</td>
            <td></td>
            <td className="field-value">
              <span className="checkbox">{formData.citizenship_filipino ? '☑' : '☐'}</span> Filipino
            </td>
            <td className="field-value">
              <span className="checkbox">{formData.citizenship_dual ? '☑' : '☐'}</span> Dual Citizenship
            </td>
            <td></td>
            <td></td>
          </tr>
          
          {/* Row 10: PLACE OF BIRTH */}
          <tr>
            <td className="field-label">4. PLACE OF BIRTH</td>
            <td className="field-value">{displayValue(formData.place_of_birth)}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td className="field-value">
              <span className="checkbox">{formData.dual_citizenship_type === 'by birth' ? '☑' : '☐'}</span> by birth
            </td>
            <td className="field-value">
              <span className="checkbox">{formData.dual_citizenship_type === 'by naturalization' ? '☑' : '☐'}</span> by naturalization
            </td>
            <td></td>
          </tr>
          
          {/* Row 11: SEX */}
          <tr>
            <td className="field-label">5. SEX</td>
            <td className="field-value" colSpan="2">
              <span className="checkbox-field">
                <span className="checkbox">{formData.sex === 'Male' ? '☑' : '☐'}</span> Male
              </span>
              <span className="checkbox-field" style={{ marginLeft: '20px' }}>
                <span className="checkbox">{formData.sex === 'Female' ? '☑' : '☐'}</span> Female
              </span>
            </td>
            <td className="field-value">If holder of dual citizenship, please indicate the details.</td>
            <td></td>
            <td className="field-value" colSpan="2">{displayValue(formData.dual_citizenship_country) || 'N/A'}</td>
          </tr>
          
          {/* Row 12: CIVIL STATUS with House/Block/Lot No and Street VALUES */}
          <tr>
            <td className="field-label" rowSpan="4">6. CIVIL STATUS</td>
            <td className="field-value" rowSpan="4">
              <div className="civil-status-layout">
                <div>
                  <span className="checkbox">{formData.civil_status === 'Single' ? '☑' : '☐'}</span> Single
                </div>
                <div>
                  <span className="checkbox">{formData.civil_status === 'Widowed' ? '☑' : '☐'}</span> Widowed
                </div>
                <div>
                  <span className="checkbox"></span> Other/s: {displayValue(formData.civil_status)}
                </div>
              </div>
            </td>
            <td className="field-value" rowSpan="4">
              <div className="civil-status-layout">
                <div>
                  <span className="checkbox">{formData.civil_status === 'Married' ? '☑' : '☐'}</span> Married
                </div>
                <div>
                  <span className="checkbox">{formData.civil_status === 'Separated' ? '☑' : '☐'}</span> Separated
                </div>
              </div>
            </td>
            <td className="field-label">17. RESIDENTIAL ADDRESS</td>
            <td className="field-value" colSpan="4">{displayValue(formData.residential_house_block_lot)}</td>
            <td className="field-value">{displayValue(formData.residential_street)}</td>
          </tr>
          
          {/* Row 14: House/Block/Lot No and Street LABELS */}
          <tr>
            <td></td>
            <td></td>
            <td className="field-label">House/Block/Lot No</td> 
            <td></td>
            <td></td>                       
            <td className="field-label">Street</td>
            
          </tr>
          
          {/* Row 15: Subdivision/Village and Barangay VALUES */}
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td className="field-value">{displayValue(formData.residential_subdivision_village)}</td>
            <td></td>
            <td className="field-value">{displayValue(formData.residential_barangay)}</td>
          </tr>
          
          {/* Row 16: Subdivision/Village and Barangay LABELS */}
          <tr>
            <td></td>
            <td></td>
            <td className="field-label">Subdivision/Village</td>
            <td></td>
            <td className="field-label">Barangay</td>
            <td></td>
          </tr>
          
          {/* Row 17: HEIGHT with City/Municipality and Province VALUES */}
          <tr>
            <td className="field-label">7. HEIGHT (m)</td>
            <td className="field-value" colSpan="2">{displayValue(formData.height)}</td>
            <td></td>
            <td></td>
            <td className="field-value">{displayValue(formData.residential_city_municipality)}</td>
            <td></td>
            <td className="field-value">{displayValue(formData.residential_province)}</td>
            <td></td>
          </tr>
          
          {/* Row 18: WEIGHT with City/Municipality and Province LABELS */}
          <tr>
            <td className="field-label">8. WEIGHT (kg)</td>
            <td className="field-value" colSpan="2">{displayValue(formData.weight)}</td>
            <td></td>
            <td></td>
            <td className="field-label">City/Municipality</td>
            <td></td>
            <td className="field-label">Province</td>
            <td></td>
          </tr>
          
          {/* New Row 18: ZIP CODE */}
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td className="field-label">ZIP CODE</td>
            
            <td></td>
            <td className="field-value">{displayValue(formData.residential_zip_code)}</td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          
          {/* Row 19: BLOOD TYPE and PERMANENT ADDRESS */}
          <tr>
            <td className="field-label">9. BLOOD TYPE</td>
            <td className="field-value">{displayValue(formData.blood_type)}</td>
            <td></td>
            <td className="field-label">18. PERMANENT ADDRESS</td>
            <td></td>
            <td className="field-value">{displayValue(formData.permanent_house_block_lot)}</td>
            <td></td>
            <td className="field-value">{displayValue(formData.permanent_street)}</td>
            <td></td>
          </tr>
          
          {/* Row 20: House/Block/Lot No and Street LABELS */}
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td className="field-label">House/Block/Lot No</td>
            <td></td>
            <td className="field-label">Street</td>
            <td></td>
          </tr>
          
          {/* Row 21: GSIS ID NO and Subdivision/Village and Barangay VALUES */}
          <tr>
            <td className="field-label">10. GSIS ID NO.</td>
            <td className="field-value" colspan="2"rowspan="2">{displayValue(formData.gsis)}</td>
            
            
            
            <td className="field-value" colspan="3">{displayValue(formData.permanent_subdivision_village)}</td>            
            <td className="field-value" colspan="2">{displayValue(formData.permanent_barangay)}</td>            
          </tr>
          
          {/* Row 22: Permanent Address Labels */}
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>            
            <td className="field-label" colspan="3">Subdivision/Village</td>            
            <td className="field-label" colspan="2">Barangay</td>
            
          </tr>
          
          {/* Row 23: PAG-IBIG ID NO */}
          <tr>
            <td className="field-label">11. PAG-IBIG ID NO.</td>
            <td className="field-value">{displayValue(formData.pagibig)}</td>
            <td></td>
            <td></td>
            
            <td className="field-value" colspan="3">{displayValue(formData.permanent_city_municipality)}</td>
            <td className="field-value" colspan="2">{displayValue(formData.permanent_province)}</td>
            
          </tr>
          
          {/* Row 25: PHILHEALTH NO */}
          <tr>
            <td className="field-label" rowspan="2">12. PHILHEALTH NO.</td>
            <td className="field-value" colspan="2" rowspan="2">{displayValue(formData.philhealth)}</td>
            <td></td>
            <td className="field-label" colspan="3">City/Municipality</td>
            <td className="field-label" colspan="2">Province</td>
            
          </tr>
          
          {/* New Row 26: Permanent ZIP CODE */}
          <tr>
            
            
            <td className="field-label">ZIP CODE</td>
            <td className="field-value" colspan="5">{displayValue(formData.permanent_zip_code)}</td>
           
          </tr>
          
          {/* Row 27: SSS NO and TELEPHONE NO */}
          <tr>
            <td className="field-label">13. SSS NO.</td>
            <td className="field-value">{displayValue(formData.sss)}</td>
            <td></td>
            <td className="field-label">19. TELEPHONE NO.</td>
            <td className="field-value" colSpan="5">{displayValue(formData.telephone)}</td>
            
          </tr>
          
          {/* Row 28: TIN NO and MOBILE NO */}
          <tr>
            <td className="field-label">14. TIN NO.</td>
            <td className="field-value">{displayValue(formData.tin)}</td>
            <td></td>
            <td className="field-label">20. MOBILE NO.</td>
            <td className="field-value" colSpan="5">{displayValue(formData.mobile)}</td>
           
          </tr>
          
          {/* Row 29: AGENCY EMPLOYEE NO and E-MAIL ADDRESS */}
          <tr>
            <td className="field-label">15. AGENCY EMPLOYEE NO.</td>
            <td className="field-value">{displayValue(formData.agency_no)}</td>
            <td></td>
            <td className="field-label">21. E-MAIL ADDRESS (if any)</td>
            <td className="field-value" colSpan="5">{displayValue(formData.email)}</td>
            
          </tr>
          
        </tbody>
      </table>

      {/* Family Background Table - 5 columns x 15 rows */}
      <table className="pds-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header */}
          <tr>
            <td colSpan="5" className="section-title" style={{ fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              II. FAMILY BACKGROUND
            </td>
          </tr>
          
          {/* Row 2: Spouse Surname */}
          <tr>
            <td className="field-label">22. SPOUSE'S SURNAME</td>
            <td className="field-value">{displayValue(formData.spouse_surname)}</td>
            <td style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}></td>
            <td className="field-label" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>23. NAME OF CHILD</td>
            <td className="field-label" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>DATE OF BIRTH</td>
          </tr>
          
          {/* Row 3: Spouse First Name, Extension, and Middle Name */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value">{displayValue(formData.spouse_firstname)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}>Name of Extension: {displayValue(formData.spouse_extension)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 0 ? displayValue(children[0].full_name) : ''}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 0 ? formatDate(children[0].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 4: Spouse Middle Name / Child 2 */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value">{displayValue(formData.spouse_middlename)}</td>
            <td style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}></td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 1 ? displayValue(children[1].full_name) : ''}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 1 ? formatDate(children[1].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 5: Child 3 / Occupation */}
          <tr>
            <td className="field-label">OCCUPATION</td>
            <td className="field-value">{displayValue(formData.spouse_occupation)}</td>
            <td style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}></td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 2 ? displayValue(children[2].full_name) : ''}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 2 ? formatDate(children[2].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 6: Child 4 / Employer/Business Name */}
          <tr>
            <td className="field-label">EMPLOYER/BUSINESS NAME</td>
            <td className="field-value">{displayValue(formData.spouse_employer_business_name)}</td>
            <td style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}></td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 3 ? displayValue(children[3].full_name) : ''}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 3 ? formatDate(children[3].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 7: Business Address */}
          <tr>
            <td className="field-label">BUSINESS ADDRESS</td>
            <td className="field-value" colSpan="4">{displayValue(formData.spouse_business_address)}</td>
          </tr>
          
          {/* Row 8: Telephone */}
          <tr>
            <td className="field-label">TELEPHONE NO.</td>
            <td className="field-value" colSpan="4">{displayValue(formData.spouse_telephone)}</td>
          </tr>
          
          {/* Row 9: Father's Surname */}
          <tr>
            <td className="field-label">24. FATHER'S SURNAME</td>
            <td className="field-value" colSpan="4">{displayValue(formData.father_surname)}</td>
          </tr>
          
          {/* Row 10: Father's First Name */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value">{displayValue(formData.father_firstname)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}>Name of Extension: {displayValue(formData.father_extension)}</td>
            <td style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}></td>
            <td></td>
          </tr>
          
          {/* Row 11: Father's Middle Name */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value" colSpan="4">{displayValue(formData.father_middlename)}</td>
          </tr>
          
          {/* Row 12: Mother's Section Label */}
          <tr>
            <td className="field-label">25. MOTHER'S MAIDEN NAME</td>
            <td colSpan="4"></td>
          </tr>
          
          {/* Row 13: Mother's Surname */}
          <tr>
            <td className="field-label">SURNAME</td>
            <td className="field-value" colSpan="4">{displayValue(formData.mother_surname)}</td>
          </tr>
          
          {/* Row 14: Mother's First Name */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value" colSpan="4">{displayValue(formData.mother_firstname)}</td>
          </tr>
          
          {/* Row 15: Mother's Middle Name */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value" colSpan="4">{displayValue(formData.mother_middlename)}</td>
          </tr>
          
        </tbody>
      </table>

      {/* Educational Background Table - 9 columns x 12 rows */}
      <table className="pds-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '6%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header */}
          <tr>
            <td colSpan="9" className="section-title" style={{ fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              III. EDUCATIONAL BACKGROUND
            </td>
          </tr>
          
          {/* Row 2: Column Headers */}
          <tr>
            <td className="field-label">LEVEL</td>
            <td className="field-label">NAME OF SCHOOL</td>
            <td className="field-label">BASIC EDUCATION/DEGREE/COURSE</td>
            <td className="field-label">PERIOD OF ATTENDANCE</td>
            <td className="field-label">HIGHEST LEVEL/UNITS EARNED</td>
            <td className="field-label">YEAR GRADUATED</td>
            <td className="field-label">SCHOLARSHIP/</td>
            <td className="field-label">ACADEMIC HONORS</td>
            <td className="row-number">2</td>
          </tr>
          
          {/* Row 3-12: Education entries */}
          {education.length > 0 ? education.slice(0, 10).map((edu, index) => (
            <tr key={index}>
              <td className="field-value">{displayValue(edu.level)}</td>
              <td className="field-value">{displayValue(edu.school_name)}</td>
              <td className="field-value">{displayValue(edu.degree_course)}</td>
              <td className="field-value">{displayValue(edu.period_from)} - {displayValue(edu.period_to)}</td>
              <td className="field-value">{displayValue(edu.highest_level_units)}</td>
              <td className="field-value">{displayValue(edu.year_graduated)}</td>
              <td className="field-value" colSpan="2">{displayValue(edu.scholarship_honors)}</td>
              <td className="row-number">{3 + index}</td>
            </tr>
          )) : Array.from({ length: 10 }, (_, index) => (
            <tr key={index}>
              <td colSpan="8"></td>
              <td className="row-number">{3 + index}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PdsPrintPage1;