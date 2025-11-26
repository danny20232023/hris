import React from 'react';

const PdsPrintPage1 = ({ formData, children = [], education = [], displayValue, formatDate, employeeMedia = [] }) => {
  // Create array for 60 rows with row numbers
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);

  // Format date to mm/dd/yyyy for children's birth dates
  const formatChildBirthDate = (dateStr) => {
    if (!dateStr) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.log('Invalid child birth date:', dateStr);
        return dateStr;
      }
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch (error) {
      console.log('Child birth date formatting error:', error, 'for date:', dateStr);
      return dateStr;
    }
  };

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              size: 8.5in 13in;
              margin: 0.25in;
            }
            body {
              margin: 0;
              padding: 0;
              font-size: 9px;
              line-height: 1.1;
            }
            .pds-table {
              border-collapse: collapse !important;
              font-size: 8px !important;
              line-height: 1.0 !important;
            }
            .pds-table td {
              padding: 2px 3px !important;
              border: 1px solid #000 !important;
              vertical-align: top !important;
              white-space: normal !important;
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
            }
            .field-label {
              font-weight: normal !important;
              background-color: #f8f8f8 !important;
            }
            .field-value {
              background-color: white !important;
            }
            .section-title {
              background-color: #e0e0e0 !important;
              font-weight: bold !important;
              text-align: center !important;
            }
            .no-page-break {
              page-break-inside: avoid !important;
            }
            .checkbox {
              font-size: 12px !important;
              font-weight: bold !important;
              color: #000 !important;
              display: inline-block !important;
              margin-right: 3px !important;
            }
          }
        `}
      </style>
      <div 
        className="no-page-break" 
        style={{
          width: '100%',
          maxWidth: '8.5in',
          margin: '0 auto',
          padding: '0.25in',
          fontSize: '10px',
          lineHeight: '1.3',
          fontFamily: 'Arial, sans-serif',
          backgroundColor: 'white',
          color: 'black'
        }}
      >
      {/* Main 60x9 table structure */}
      <table 
        className="pds-table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '9px',
          marginBottom: '0.1in',
          whiteSpace: 'normal',
          wordWrap: 'break-word'
        }}
      >
        <colgroup>
          <col style={{ width: '17%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header title */}
          
          <tr style={{ height:'15px' }}>
            <td colSpan="9" className="pds-header-main" style={{ textAlign: 'left',  fontSize: '8px', padding: '10px 0' }}>
              CS Form No. 212 - Revised 2017<br/>
              
            </td>
          </tr >
          <tr style={{ height:'70px' }}>
            <td colSpan="9" className="pds-header-main" style={{ topcellborder:'transparent', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', fontSize: '22px', padding: '10px 0' }}>
                            PERSONAL DATA SHEET
            </td>
          </tr>
          
          {/* Row 2: Warning */}
          <tr>
            <td colSpan="9" className="warning-text" style={{ fontSize: '12px', padding: '8px 0', fontWeight: 'normal' }}>
            &nbsp;WARNING: Ang misrepresentation made in the Personal Data Sheet and the Work Experience Sheet shall cause the filing of  &nbsp;administrative/criminal case/s against the person concerned.
              <br></br>
            <br></br> &nbsp;READ THE ATTACHED GUIDE TO FILLING OUT THE PERSONAL DATA SHEET (PDS) BEFORE ACCOMPLISHING THE PDS FORM
            <br></br>
            </td>
          </tr>
          
          
          
          {/* Row 4: Guidelines */}
          <tr>
            <td colSpan="9" className="filling-guidelines" style={{ fontSize: '10px', padding: '8px 0' }}>
            &nbsp;Print legibly. Tick appropriate [✓]xes (☐) and use separate sheet if necessary. Indicate N/A if not applicable. DO NOT 1. CS ID No [ ] (Do not fill up. For CSC use only)
            </td>
          </tr>
          
          {/* Row 5: Section I Header */}
          <tr>
            <td colSpan="9" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
               &nbsp;&nbsp;I. PERSONAL INFORMATION
            </td>
          </tr>
          
          {/* Row 6: SURNAME */}
          <tr style={{ height:'28px'}}>
            <td className="field-label">2. SURNAME</td>
            <td className="field-value" colSpan="8" style={{ textAlign: 'left', verticalAlign: 'middle'}}>{displayValue(formData.surname)}</td>
           
          </tr>
          
          {/* Row 7: FIRST NAME and NAME EXTENSION */}
          <tr style={{ height:'28px'}}>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value" colspan="4" style={{ textAlign: 'left', verticalAlign: 'middle'}}>{displayValue(formData.firstname)}</td>           
            <td className="field-label" colspan="2" style={{ textAlign: 'left', verticalAlign: 'middle'}}>NAME EXTENSION (JR.,SR)</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'left', verticalAlign: 'middle'}}>{displayValue(formData.name_extension)}</td>
            
          </tr>
          
          {/* Row 8: MIDDLE NAME */}
          <tr style={{ height:'28px'}}>
            <td className="field-label" style={{ textAlign: 'left', verticalAlign: 'middle'}}>MIDDLE NAME</td>
            <td className="field-value" colSpan="8" style={{ textAlign: 'left', verticalAlign: 'middle'}}>{displayValue(formData.middlename)}</td>
          
          </tr>
          
          {/* Row 9: DATE OF BIRTH and CITIZENSHIP */}
          <tr>
            <td className="field-label" >3. DATE OF BIRTH (mm/dd/yyyy)</td>
             <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'normal', wordWrap: 'break-word'}}>{displayValue(formData.date_of_birth)}</td>
            
            <td className="field-label" colspan="2" rowspan="2">16. CITIZENSHIP</td>
            
            <td className="field-value" rowspan="2">
              <span className="checkbox">{formData.citizenship_filipino ? '☑' : '☐'}</span> Filipino
            </td>
            <td className="field-value" colspan="3">
              <span className="checkbox">{formData.citizenship_dual ? '☑' : '☐'}</span> Dual Citizenship
            </td>
            
          </tr>
          
          {/* Row 10: PLACE OF BIRTH */}
          <tr>
            <td className="field-label">4. PLACE OF BIRTH</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.place_of_birth)}</td>                
            
            <td className="field-value">
              <span className="checkbox">{formData.dual_citizenship_type === 'by birth' ? '☑' : '☐'}</span> by birth
              {/* Debug: {console.log('dual_citizenship_type:', formData.dual_citizenship_type)} */}
            </td>
            <td className="field-value" colspan="2">
              <span className="checkbox">
                {(() => {
                  console.log('=== DUAL CITIZENSHIP DEBUG ===');
                  console.log('dual_citizenship_type:', formData.dual_citizenship_type);
                  console.log('Type of dual_citizenship_type:', typeof formData.dual_citizenship_type);
                  console.log('citizenship_dual:', formData.citizenship_dual);
                  console.log('citizenship_filipino:', formData.citizenship_filipino);
                  console.log('dual_citizenship_country:', formData.dual_citizenship_country);
                  console.log('All formData keys:', Object.keys(formData));
                  
                  // Check for various naturalization values
                  const isNaturalization = formData.dual_citizenship_type === 'by naturalization' || 
                                         formData.dual_citizenship_type === 'naturalization' ||
                                         formData.dual_citizenship_type === 'By Naturalization' ||
                                         formData.dual_citizenship_type === 'NATURALIZATION' ||
                                         (formData.dual_citizenship_type && formData.dual_citizenship_type.toLowerCase().includes('naturalization'));
                  
                  // Also check if dual citizenship is true and look for naturalization in other fields
                  const hasDualCitizenship = formData.citizenship_dual === true || formData.citizenship_dual === 'true' || formData.citizenship_dual === 1;
                  const hasNaturalizationInCountry = formData.dual_citizenship_country && 
                    formData.dual_citizenship_country.toLowerCase().includes('naturalization');
                  
                  const finalResult = isNaturalization || (hasDualCitizenship && hasNaturalizationInCountry);
                  
                  console.log('Is naturalization (any variation):', isNaturalization);
                  console.log('Has dual citizenship:', hasDualCitizenship);
                  console.log('Has naturalization in country:', hasNaturalizationInCountry);
                  console.log('Final result:', finalResult);
                  console.log('Final checkbox result:', finalResult ? '☑' : '☐');
                  return finalResult ? '☑' : '☐';
                })()}
              </span> by naturalization
            </td>
            
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
            <td className="field-value" colspan="2">If holder of dual citizenship, please indicate the details.</td>
            
            <td className="field-value" colSpan="4" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.dual_citizenship_country) || 'N/A'}</td>
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
                <span className="checkbox">{formData.civil_status === 'Other/s' ? '☑' : '☐'}</span> Other/s
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
            <td className="field-label" rowspan="6">17. RESIDENTIAL ADDRESS</td>
            <td className="field-value" colSpan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_house_block_lot)}</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_street)}</td>
          </tr>
          
          {/* Row 14: House/Block/Lot No and Street LABELS */}
          <tr>
                       
            <td className="field-label" colspan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>House/Block/Lot No</td> 
                                   
            <td className="field-label" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>Street</td>
            
          </tr>
          
          {/* Row 15: Subdivision/Village and Barangay VALUES */}
          <tr>
                       
            <td className="field-value" colspan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_subdivision_village)}</td>
            
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_barangay)}</td>
          </tr>
          
          {/* Row 16: Subdivision/Village and Barangay LABELS */}
          <tr>
                        
            <td className="field-label" colspan="3" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Subdivision/Village</td>
            
            <td className="field-label" colspan="2" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Barangay</td>
            
          </tr>
          
          {/* Row 17: HEIGHT with City/Municipality and Province VALUES */}
          <tr >
            <td className="field-label" style={{verticalAlign:'middle'}}>7. HEIGHT (m)</td>
            <td className="field-value" colSpan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.height)}</td>
            
            
            <td className="field-value" colspan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_city_municipality)}</td>
            
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_province)}</td>
            
          </tr>
          
          {/* Row 18: WEIGHT with City/Municipality and Province LABELS */}
          <tr>
            <td className="field-label" rowspan="2">8. WEIGHT (kg)</td>
            <td className="field-value" colSpan="2" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.weight)}</td>
            
            
            <td className="field-label" colspan="3" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>City/Municipality</td>
            
            <td className="field-label" colspan="2" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Province</td>
            
          </tr>
          
          {/* New Row 18: ZIP CODE */}
          <tr>
            
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle'}}>ZIP CODE</td>           
            <td className="field-value" colspan="5" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.residential_zip_code)}</td>
            
            
            
          </tr>
          
          {/* Row 19: BLOOD TYPE and PERMANENT ADDRESS */}
          <tr>
            <td className="field-label" rowspan="2">9. BLOOD TYPE</td>
            <td className="field-value" colspan="2" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.blood_type)}</td>
            
            <td className="field-label" rowspan="6">18. PERMANENT ADDRESS</td>
            <td className="field-value" colspan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_house_block_lot)}</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_street)}</td>
            
          </tr>
          
          {/* Row 20: House/Block/Lot No and Street LABELS */}
          <tr>
            
            <td className="field-label" colspan="3" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>House/Block/Lot No</td>            
            <td className="field-label" colspan="2" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Street</td>
            
          </tr>
          
          {/* Row 21: GSIS ID NO and Subdivision/Village and Barangay VALUES */}
          <tr>
            <td className="field-label" rowspan="2">10. GSIS ID NO.</td>
            <td className="field-value" colspan="2"rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.gsis)}</td>
                        
            
            <td className="field-value" colspan="3" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_subdivision_village)}</td>            
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_barangay)}</td>            
          </tr>
          
          {/* Row 22: Permanent Address Labels */}
          <tr>
                        
            <td className="field-label" colspan="3" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Subdivision/Village</td>            
            <td className="field-label" colspan="2" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Barangay</td>
            
          </tr>
          
          {/* Row 23: PAG-IBIG ID NO */}
          <tr>
            <td className="field-label">11. PAG-IBIG ID NO.</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.pagibig)}</td>
            <td className="field-value" colspan="3" style={{ textAlign: 'center', fverticalAlign: 'middle'}}>{displayValue(formData.permanent_city_municipality)}</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_province)}</td>
            
          </tr>
          
          {/* Row 25: PHILHEALTH NO */}
          <tr>
            <td className="field-label" rowspan="2">12. PHILHEALTH NO.</td>
            <td className="field-value" colspan="2" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.philhealth)}</td>
            
            <td className="field-label" colspan="3" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>City/Municipality</td>
            <td className="field-label" colspan="2" style={{ textAlign: 'center', fontSize:'8px',verticalAlign: 'middle'}}>Province</td>
            
          </tr>
          
          {/* New Row 26: Permanent ZIP CODE */}
          <tr>
            
            
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle'}}>ZIP CODE</td>
            <td className="field-value" colspan="5" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.permanent_zip_code)}</td>
           
          </tr>
          
          {/* Row 27: SSS NO and TELEPHONE NO */}
          <tr>
            <td className="field-label">13. SSS NO.</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.sss)}</td>
            
            <td className="field-label">19. TELEPHONE NO.</td>
            <td className="field-value" colSpan="5" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.telephone)}</td>
            
          </tr>
          
          {/* Row 28: TIN NO and MOBILE NO */}
          <tr>
            <td className="field-label">14. TIN NO.</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.tin)}</td>
            <td className="field-label">20. MOBILE NO.</td>
            <td className="field-value" colSpan="5" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.mobile)}</td>
           
          </tr>
          
          {/* Row 29: AGENCY EMPLOYEE NO and E-MAIL ADDRESS */}
          <tr>
            <td className="field-label">15. AGENCY EMPLOYEE NO.</td>
            <td className="field-value" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.agency_no)}</td>
            <td className="field-label">21. E-MAIL ADDRESS (if any)</td>
            <td className="field-value" colSpan="5" style={{ textAlign: 'center', verticalAlign: 'middle'}}>{displayValue(formData.email)}</td>
            
          </tr>
          
        </tbody>
      </table>

      {/* Family Background Table - 5 columns x 15 rows */}
      <table 
        className="pds-table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '9px',
          marginBottom: '0.1in',
          whiteSpace: 'normal',
          wordWrap: 'break-word'
        }}
      >
        <colgroup>
          <col style={{ width: '19.5%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '15.5%' }} />
          <col style={{ width: '30.5%' }} />
          <col style={{ width: '21.5%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header */}
          <tr>
            <td colSpan="5" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
            &nbsp;&nbsp;II. FAMILY BACKGROUND
            </td>
          </tr>
          
          {/* Row 2: Spouse Surname + Children Headers */}
          <tr>
            <td className="field-label">22. SPOUSE'S SURNAME</td>
            <td className="field-value" COLSPAN="2">{displayValue(formData.spouse_surname)}</td>
            
            <td className="field-label" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>23. NAME OF CHILD</td>
            <td className="field-label" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>DATE OF BIRTH</td>
          </tr>
          
          {/* Row 3: Spouse First Name + Child 1 */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value">{displayValue(formData.spouse_firstname)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}>Name of Extension: {displayValue(formData.spouse_extension)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 0 ? displayValue(children[0].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 0 ? formatChildBirthDate(children[0].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 4: Spouse Middle Name + Child 2 */}
          <tr>
            <td className="field-label" >MIDDLE NAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.spouse_middlename)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 1 ? displayValue(children[1].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 1 ? formatChildBirthDate(children[1].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 5: Spouse Occupation + Child 3 */}
          <tr>
            <td className="field-label">OCCUPATION</td>
            <td className="field-value" colspan="2">{displayValue(formData.spouse_occupation)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 2 ? displayValue(children[2].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 2 ? formatChildBirthDate(children[2].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 6: Spouse Employer + Child 4 */}
          <tr>
            <td className="field-label">EMPLOYER/BUSINESS NAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.spouse_employer_business_name)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 3 ? displayValue(children[3].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 3 ? formatChildBirthDate(children[3].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 7: Spouse Business Address + Child 5 */}
          <tr>
            <td className="field-label">BUSINESS ADDRESS</td>
            <td className="field-value" colspan="2">{displayValue(formData.spouse_business_address)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 4 ? displayValue(children[4].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 4 ? formatChildBirthDate(children[4].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 8: Spouse Telephone + Child 6 */}
          <tr>
            <td className="field-label">TELEPHONE NO.</td>
            <td className="field-value" colspan="2">{displayValue(formData.spouse_telephone)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 5 ? displayValue(children[5].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 5 ? formatChildBirthDate(children[5].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 9: Father's Surname + Child 7 */}
          <tr>
            <td className="field-label">24. FATHER'S SURNAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.father_surname)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 6 ? displayValue(children[6].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 6 ? formatChildBirthDate(children[6].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 10: Father's First Name + Child 8 */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value">{displayValue(formData.father_firstname)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000' }}>Name of Extension: {displayValue(formData.father_extension)}</td>
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 7 ? displayValue(children[7].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 7 ? formatChildBirthDate(children[7].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 11: Father's Middle Name + Child 9 */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.father_middlename)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 8 ? displayValue(children[8].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 8 ? formatChildBirthDate(children[8].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 12: Mother's Section + Child 10 */}
          <tr>
            <td className="field-label">25. MOTHER'S MAIDEN NAME</td>
            <td className="field-value" colspan="2"></td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 9 ? displayValue(children[9].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 9 ? formatChildBirthDate(children[9].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 13: Mother's First Name + Child 11 */}
          <tr>
            <td className="field-label">SURNAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.mother_firstname)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 10 ? displayValue(children[10].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 10 ? formatChildBirthDate(children[10].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 14: Mother's Middle Name + Child 12 */}
          <tr>
            <td className="field-label">FIRST NAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.mother_middlename)}</td>
            
            <td className="field-value" style={{ borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 11 ? displayValue(children[11].full_name) : ''}</td>
            <td className="field-value" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>{children.length > 11 ? formatChildBirthDate(children[11].date_of_birth) : ''}</td>
          </tr>
          
          {/* Row 15: Child 13 */}
          <tr>
            <td className="field-label">MIDDLE NAME</td>
            <td className="field-value" colspan="2">{displayValue(formData.mother_surname)}</td>
            
            
            <td className="field-label" colspan="2" style={{  textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px solid black', borderRight: '1px solid black' }}>(Continue on separate sheet if necessary)</td>
            
          </tr>
          
        </tbody>
      </table>

      {/* Educational Background Table - 8 columns x 12 rows */}
      <table 
        className="pds-table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '9px',
          marginBottom: '0.1in',
          whiteSpace: 'normal',
          wordWrap: 'break-word'
        }}
      >
        <colgroup>
          <col style={{ width: '19%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header */}
          <tr>
            <td colSpan="8" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
            &nbsp;&nbsp;III. EDUCATIONAL BACKGROUND
            </td>
          </tr>
          
          {/* Row 2: Column Headers */}
          <tr>
            <td className="field-label" rowspan="2" style={{ verticalAlign: 'middle'}}>26. LEVEL</td>
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', borderbottom: 'transparent' }}>NAME OF SCHOOL</td>
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle'}}>BASIC EDUCATION/DEGREE/ COURSE</td>
            <td className="field-label" colspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>PERIOD OF ATTENDANCE</td>            
             <td className="field-label" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>HIGHEST LEVEL/UNITS EARNED<br/>(if not graduated)</td>
            <td className="field-label" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>YEAR GRADUATED</td>
            <td className="field-label" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle'}}>SCHOLARSHIP/ HONORS</td>
          </tr>
          
          {/* Row 3: Additional header row */}
          <tr>
             <td className="field-label" style={{ borderTop: 'transparent' }}>(Write in full)</td>
             <td className="field-label" style={{ borderTop: 'transparent' }}>(Write in full)</td>
            <td className="field-label">FROM</td>
            <td className="field-label">TO</td>
          
          </tr>
          
          {/* Row 4-13: Education entries */}
          {education.length > 0 ? (() => {
            // Define the required order for education levels
            const levelOrder = [
              'Elementary',
              'Secondary', 
              'Vocational/Trade Course',
              'College',
              'Graduate Studies'
            ];
            
            // Sort education array by the defined level order
            const sortedEducation = [...education].sort((a, b) => {
              const levelA = displayValue(a.level) || '';
              const levelB = displayValue(b.level) || '';
              const indexA = levelOrder.indexOf(levelA);
              const indexB = levelOrder.indexOf(levelB);
              
              // If both levels are in the order, sort by their position
              if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
              }
              // If only one is in the order, prioritize it
              if (indexA !== -1) return -1;
              if (indexB !== -1) return 1;
              // If neither is in the order, maintain original order
              return 0;
            });
            
            return sortedEducation.slice(0, 10).map((edu, index) => {
              // Format period dates to mm/dd/yyyy format
              const formatDateToMMDDYYYY = (dateStr) => {
                if (!dateStr) return '';
                
                // If it's already in mm/dd/yyyy format, return as is
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
                  return dateStr;
                }
                
                try {
                  // Handle various date formats and convert to mm/dd/yyyy
                  const date = new Date(dateStr);
                  if (isNaN(date.getTime())) {
                    console.log('Invalid date:', dateStr);
                    return dateStr; // Return original if can't parse
                  }
                  
                  const month = (date.getMonth() + 1).toString().padStart(2, '0');
                  const day = date.getDate().toString().padStart(2, '0');
                  const year = date.getFullYear();
                  return `${month}/${day}/${year}`;
                } catch (error) {
                  console.log('Date formatting error:', error, 'for date:', dateStr);
                  return dateStr; // Return original if error
                }
              };
              
              // Extract year only from year_graduated (should be yyyy format)
              const getYearOnly = (yearStr) => {
                if (!yearStr || yearStr === 'N/A') return 'N/A';
                try {
                  // If it's already a year (4 digits), return as is
                  if (/^\d{4}$/.test(yearStr.toString())) {
                    return yearStr.toString();
                  }
                  // If it's a full date, extract year
                  const date = new Date(yearStr);
                  return isNaN(date.getTime()) ? 'N/A' : date.getFullYear().toString();
                } catch {
                  return 'N/A';
                }
              };
              
              // Split honor_received field into scholarship and academic honors
              // Assuming they are separated by a delimiter like "|" or ";"
              const honorReceived = displayValue(edu.honor_received) || '';
              const [scholarship = '', academicHonors = ''] = honorReceived.split('|').map(s => s.trim());
              
              return (
                <tr style={{height:'28px'}} key={index}>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{displayValue(edu.level)}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{displayValue(edu.school_name)}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{displayValue(edu.course)}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{(() => {
                    const fromValue = displayValue(edu.from);
                    console.log('FROM Column Debug:', {
                      rawValue: edu.from,
                      displayValue: fromValue,
                      isNA: fromValue === 'N/A',
                      formatted: fromValue === 'N/A' ? fromValue : formatDateToMMDDYYYY(fromValue)
                    });
                    return fromValue === 'N/A' ? fromValue : formatDateToMMDDYYYY(fromValue);
                  })()}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{(() => {
                    const toValue = displayValue(edu.to);
                    console.log('TO Column Debug:', {
                      rawValue: edu.to,
                      displayValue: toValue,
                      isNA: toValue === 'N/A',
                      formatted: toValue === 'N/A' ? toValue : formatDateToMMDDYYYY(toValue)
                    });
                    return toValue === 'N/A' ? toValue : formatDateToMMDDYYYY(toValue);
                  })()}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{displayValue(edu.highest_level)}</td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{getYearOnly(displayValue(edu.year_graduated))}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{scholarship || academicHonors}</td>
                </tr>
              );
            });
          })() : Array.from({ length: 10 }, (_, index) => (
            <tr key={index}>
              <td colSpan="8"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer Table - 4 columns x 3 rows for Signature and Date */}
      <table 
        className="pds-table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '9px',
          marginBottom: '0.1in',
          whiteSpace: 'normal',
          wordWrap: 'break-word',
          marginTop: '0.2in'
        }}
      >
        <colgroup>
          <col style={{ width: '18.5%' }} />
          <col style={{ width: '46.5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Signature Labels */}
          <tr>
            <td className="field-label" colspan="4"style={{ textAlign: 'left', verticalAlign: 'middle', height: '20px' }}>(Continue on separate sheet if necessary)</td>
            
          </tr>
          
          {/* Row 2: Date Labels */}
            <tr>
              <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>SIGNATURE</td>
              <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>
                {(() => {
                  // Debug: Log all formData keys to find the correct signature field
                  console.log('All formData keys:', Object.keys(formData));
                  console.log('formData object:', formData);
                  console.log('employeeMedia array:', employeeMedia);
                  
                  // Check for common signature field names in formData
                  const possibleSignatureFields = [
                    'signature_path',
                    'signature',
                    'signature_image',
                    'signature_file',
                    'employee_signature',
                    'signature_url'
                  ];
                  
                  let signatureField = null;
                  
                  // First check formData
                  for (const field of possibleSignatureFields) {
                    if (formData[field]) {
                      signatureField = formData[field];
                      console.log(`Found signature field in formData: ${field} = ${signatureField}`);
                      break;
                    }
                  }
                  
                  // If not found in formData, check employeeMedia array
                  if (!signatureField && employeeMedia && employeeMedia.length > 0) {
                    console.log('Checking employeeMedia array for signature...');
                    for (const media of employeeMedia) {
                      console.log('Media item:', media);
                      if (media.signature_path) {
                        signatureField = media.signature_path;
                        console.log(`Found signature in employeeMedia: ${media.signature_path}`);
                        break;
                      }
                    }
                  }
                  
                  console.log('Signature Path Debug:', {
                    signature_path: formData.signature_path,
                    type: typeof formData.signature_path,
                    exists: !!formData.signature_path,
                    foundField: signatureField,
                    employeeMediaLength: employeeMedia ? employeeMedia.length : 0
                  });
                  
                  if (signatureField) {
                    return (
                      <img 
                        src={signatureField} 
                        alt="Signature" 
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '40px', 
                          objectFit: 'contain',
                          border: '1px solid #ccc'
                        }}
                        onError={(e) => {
                          console.error('Image load error:', e);
                          console.error('Failed to load signature image:', signatureField);
                        }}
                        onLoad={() => {
                          console.log('Signature image loaded successfully:', signatureField);
                        }}
                      />
                    );
                  } else {
                    console.log('No signature path provided');
                    console.log('To add signature:');
                    console.log('1. Fetch employee_media data with signature_path field');
                    console.log('2. Pass it as employeeMedia prop to PdsPrintPage1 component');
                    console.log('3. Or add signature_path directly to formData object');
                    
                    return (
                      <div style={{ 
                        color: '#999', 
                        fontSize: '8px', 
                        textAlign: 'center',
                        border: '1px dashed #ccc',
                        padding: '5px',
                        backgroundColor: '#f9f9f9'
                      }}>
                        <div>No signature data found</div>
                        <div style={{ fontSize: '6px', marginTop: '2px' }}>
                          Add employeeMedia prop with signature_path
                        </div>
                      </div>
                    );
                  }
                })()}
              </td>
              <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>DATE</td>
              <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>{displayValue(formData.date_accomplished) || ''}</td>
            </tr>
          
          {/* Row 3: Empty space for actual signatures */}
          <tr>
            
            <td className="field-label" colspan="4" style={{ textAlign: 'right', verticalAlign: 'middle', height: '20px' }}> CS FORM 212 (Revised 2017), Page 1 of 4</td>
          </tr>
        </tbody>
      </table>
      </div>
    </>
  );
};

export default PdsPrintPage1;