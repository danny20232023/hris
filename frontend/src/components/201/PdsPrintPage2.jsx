import React from 'react';

const PdsPrintPage2 = ({ 
  formData,
  civilServiceEligibility = [], 
  workExperience = [], 
  displayValue, 
  formatDate, 
  displayYesNo 
}) => {
  // Custom date formatter for mm/dd/yyyy format
  const formatDateToMMDDYYYY = (dateStr) => {
    if (!dateStr || dateStr === '' || dateStr === '0000-00-00') {
      return 'N/A';
    }
    
    // If already in mm/dd/yyyy format, return as is
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      return dateStr;
    }
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.log('Invalid date:', dateStr);
        return 'N/A';
      }
      
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch (error) {
      console.log('Date formatting error:', error, 'for date:', dateStr);
      return 'N/A';
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
      {/* Civil Service Eligibility Table */}
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
          <col style={{ width: '20%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="6" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;IV. CIVIL SERVICE ELIGIBILITY
            </td>
          </tr>
          <tr>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>CAREER SERVICE/ RA 1080 (BOARD/ BAR) UNDER SPECIAL LAWS/ CES/ CSEE
              BARANGAY ELIGIBILITY / DRIVER'S LICENSE</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>RATING <br></br>(if Applicable)</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>DATE OF EXAMINATION/ CONFERMENT</td>
            <td className="field-label" rowspan="2"style={{textAlign:'center', verticalAlign:'middle'}}>PLACE OF EXAMINATION / CONFERMENT</td>
            <td className="field-label" colspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>LICENSE NUMBER (if applicatble)</td>
            
          </tr>
          <tr>
          
           
            <td className="field-label" style={{textAlign:'center', verticalAlign:'middle'}}>NUMBER</td>
            <td className="field-label" style={{textAlign:'center', verticalAlign:'middle'}}>DATE OF VALIDITY</td>
            
          </tr>
          
          {/* Static 11 rows for Civil Service Eligibility with single N/A on first missing */}
          {(() => {
            const rows = [];
            let naShown = false;
            for (let index = 0; index < 9; index++) {
              const elig = civilServiceEligibility[index] || {};
              const hasRow = civilServiceEligibility[index] !== undefined && elig !== null;
              const showNA = !hasRow && !naShown;
              if (showNA) naShown = true;
              rows.push(
                <tr key={index} style={{height:'28px'}}>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(elig.eligibility_type) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? displayValue(elig.rating) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(elig.date_of_examination) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(elig.place_of_examination) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayValue(elig.license_number) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(elig.date_of_validity) : (showNA ? 'N/A' : '')}</td>
                </tr>
              );
            }
            return rows;
          })()}
        <tr><td colspan="6" style={{textAlign:'center', verticalAlign:'middle', color:'red'}}>(Continue on separate sheet if necessary)</td></tr>
        </tbody>
      </table>

      {/* Work Experience Table */}
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
          <col style={{ width: '15%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="8" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;V. WORK EXPERIENCE
              
            </td>
          </tr>
          <tr>
            <td className="field-label" colspan="8">
            (Include private employment.  Start from your recent work) Description of duties should be indicated in the attached Work Experience sheet.
            </td>
          </tr>
          <tr>
            <td className="field-label" colspan="2" style={{ textAlign:'center', verticalAlign:'middle'}}>28 INCLUSIVE DATES <br></br>(mm/dd/yyyy)</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>POSITION TITLE <br></br>(Write in full/Do not abbreviate)</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>DEPARTMENT / AGENCY / OFFICE / COMPANY   (Write in full/Do not abbreviate)</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>MONTHLY SALARY</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>SALARY/ JOB/ PAY GRADE <br></br>(if applicable)& STEP  (Format "00-0")/ INCREMENT</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>STATUS OF APPOINTMENT</td>
            <td className="field-label" rowspan="2" style={{textAlign:'center', verticalAlign:'middle'}}>GOV'T SERVICE <br></br>(Y/ N)</td>
            </tr>
            <tr>
            <td className="field-label" style={{textAlign:'center', verticalAlign:'middle'}}>From</td>
            <td className="field-label" style={{textAlign:'center', verticalAlign:'middle'}}>To</td>
            <td className="field-label"></td>
            <td className="field-label"></td>
            <td className="field-label"></td>
            <td className="field-label"></td>
            <td className="field-label"></td>
            <td className="field-label"></td>
            </tr>
          {/* Static 35 rows for Work Experience - records start from row 5 */}
          {(() => {
            const rows = [];
            let naShown = false;
            for (let index = 0; index < 28; index++) {
              // Work experience data starts from index 0 but displays from row 5 (index 4)
              const workIndex = index >= 0 ? index - 0 : -1;
              const work = workIndex >= 0 ? (workExperience[workIndex] || {}) : {};
              const hasRow = workIndex >= 0 && workExperience[workIndex] !== undefined && work !== null;
              const showNA = !hasRow && !naShown && index >= 0;
              if (showNA) naShown = true;
              rows.push(
                <tr key={index} style={{height:'28px'}}>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(work.date_from) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? (work.is_present ? 'Present' : formatDateToMMDDYYYY(work.date_to)) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(work.position_title) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(work.department_agency_company) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? displayValue(work.monthly_salary) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayValue(work.salary_grade_step) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayValue(work.status_of_appointment) : (showNA ? 'N/A' : '')}</td>
                  <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayYesNo(work.government_service) : (showNA ? 'N/A' : '')}</td>
              </tr>
              );
            }
            return rows;
          })()}

          <tr><td colspan="8" style={{textAlign:'center', verticalAlign:'middle', color:'red'}}>(Continue on separate sheet if necessary)</td></tr>
  
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
            <td className="field-label" colspan="4" style={{ textAlign: 'left', verticalAlign: 'middle', height: '20px' }}>(Continue on separate sheet if necessary)</td>
            </tr>
          
          {/* Row 2: Date Labels */}
          <tr>
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>SIGNATURE</td>
            <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>
              {/* Signature placeholder - can be enhanced with actual signature data if needed */}
              <div style={{ 
                color: '#999', 
                fontSize: '8px', 
                textAlign: 'center',
                border: '1px dashed #ccc',
                padding: '5px',
                backgroundColor: '#f9f9f9'
              }}>
                <div>Signature area</div>
              </div>
            </td>
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>DATE</td>
            <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' }}>{displayValue(formData.date_accomplished) || ''}</td>
            </tr>
          
          {/* Row 3: Empty space for actual signatures */}
          <tr>
            <td className="field-label" colspan="4" style={{ textAlign: 'right', verticalAlign: 'middle', height: '20px' }}> CS FORM 212 (Revised 2017), Page 2 of 4</td>
              </tr>
          </tbody>
        </table>
    </div>
    </>
  );
};

export default PdsPrintPage2;
