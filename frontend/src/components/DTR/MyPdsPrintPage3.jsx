import React from 'react';

const PdsPrintPage3 = ({ 
  voluntaryWork = [], 
  trainings = [], 
  skills = [], 
  recognitions = [], 
  memberships = [], 
  displayValue, 
  formatDate,
  formData = {}
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
      {/* Voluntary Work Table */}
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
          <col style={{ width: '50%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="5" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;VI. VOLUNTARY WORK OR INVOLVEMENT IN CIVIC/NON-GOVERNMENT/PEOPLE/VOLUNTARY ORGANIZATION/S
              
            </td>
          </tr>
          <tr>
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>29. NAME & ADDRESS OF ORGANIZATION <br></br> (Write in full)</td>
            <td className="field-label" colspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>INCLUSIVE DATES <br></br>(mm/dd/yyyy)</td>            
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>NUMBER OF HOURS</td>
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>POSITION/NATURE OF WORK</td>
          </tr>
          <tr>
            <td className="field-label" style={{ textAlign:'center',verticalAlign:'middle'}}>From</td>            
            <td className="field-label" style={{ textAlign:'center',verticalAlign:'middle'}}>To</td>
            
          </tr>
          {/* Static 12 rows for Voluntary Work */}
          {Array.from({ length: 7 }, (_, index) => {
            const work = voluntaryWork[index] || {};
            const hasRow = voluntaryWork[index] !== undefined && work !== null;
            return (
              <tr key={index} style={{height:'28px'}}>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(work.organization_name_address) : ''}</td>
                <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(work.date_from) : ''}</td>
                <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(work.date_to) : ''}</td>
                <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayValue(work.number_of_hours) : ''}</td>
                <td className="field-value" style={{ textAlign:'center',verticalAlign:'middle'}}>{hasRow ? displayValue(work.position_nature_of_work) : ''}</td>
                
              </tr>
            );
          })}
          <tr>
            <td className="field-label" colspan="5"style={{ textAlign:'center',verticalAlign:'middle', color:'red'}}>(Continue on separate sheet if necessary)</td>            
          </tr>
        </tbody>
      </table>

      {/* Learning and Development Table */}
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
          <col style={{ width: '40%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="6" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;VII. LEARNING AND DEVELOPMENT (L&D) INTERVENTIONS/TRAINING PROGRAMS ATTENDED
              <br></br>
               
            </td>
            </tr>
          <tr>
            <td className="field-label" colSpan="6" >Start from the most recent L&D/training program and include only the relevant L&D/training taken for the last five (5) years for Division Chief/Executive/Managerial positions)
            </td>
          </tr>
          
          <tr>
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>30. TITLE OF LEARNING AND DEVELOPMENT INTERVENTIONS/TRAINING PROGRAMS</td>
            <td className="field-label" colspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>INCLUSIVE DATES OF ATTENDANCE</td>
            
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>NUMBER OF HOURS</td>
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}>Type of LD (Managerial/ Supervisory/Technical/etc)</td>
            <td className="field-label" rowspan="2" style={{ textAlign:'center',verticalAlign:'middle'}}> CONDUCTED/ SPONSORED BY</td>
          </tr>
          <tr>
            
            <td className="field-label" style={{ textAlign:'center',verticalAlign:'middle'}}>From</td>
            <td className="field-label" style={{ textAlign:'center',verticalAlign:'middle'}}>To</td>
            
          </tr>
          {/* Static 27 rows for Learning and Development */}
          {Array.from({ length: 21 }, (_, index) => {
            const training = trainings[index] || {};
            const hasRow = trainings[index] !== undefined && training !== null;
            return (
              <tr key={index} style={{height:'28px'}}>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(training.training_title) : ''}</td>
                <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(training.date_from) : ''}</td>
                <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? formatDateToMMDDYYYY(training.date_to) : ''}</td>
                <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>{hasRow ? displayValue(training.number_of_hours) : ''}</td>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(training.type_of_ld) : ''}</td>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRow ? displayValue(training.conducted_sponsored_by) : ''}</td>
               
              </tr>
            );
          })}
           <tr>
            <td className="field-label" colspan="6"style={{ textAlign:'center',verticalAlign:'middle', color:'red'}}>(Continue on separate sheet if necessary)</td>            
          </tr>
        </tbody>
      </table>

      {/* Other Information Table */}
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
          <col style={{ width: '30%' }} />
          <col style={{ width: '50%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="3" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;VIII. OTHER INFORMATION
            </td>
          </tr>
          <tr>
            <td className="field-label" style={{ textAlign:'center', verticalAlign:'middle'}}>31. SPECIAL SKILLS and HOBBIES</td>
            <td className="field-label" style={{ textAlign:'center', verticalAlign:'middle'}}>32. NON-ACADEMIC DISTINCTIONS / RECOGNITION</td>
            <td className="field-label" style={{ textAlign:'center', verticalAlign:'middle'}}>33. MEMBERSHIP IN ASSOCIATION/ORGANIZATION</td>
          </tr>
          {/* Static 10 rows for Other Information */}
          {Array.from({ length: 10 }, (_, index) => {
            const skill = skills[index] || {};
            const recognition = recognitions[index] || {};
            const membership = memberships[index] || {};
            const hasSkill = skills[index] !== undefined && skill !== null;
            const hasRecognition = recognitions[index] !== undefined && recognition !== null;
            const hasMembership = memberships[index] !== undefined && membership !== null;
            return (
              <tr key={index} style={{height:'28px'}}>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasSkill ? displayValue(skill.skill_hobby) : ''}</td>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasRecognition ? displayValue(recognition.recognition) : ''}</td>
                <td className="field-value" style={{ verticalAlign:'middle'}}>{hasMembership ? displayValue(membership.organization) : ''}</td>
              </tr>
            );
          })}
           <tr>
            <td className="field-label" colspan="3"style={{ textAlign:'center',verticalAlign:'middle', color:'red'}}>(Continue on separate sheet if necessary)</td>            
          </tr>
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
            <td className="field-label" colspan="4" style={{ textAlign: 'right', verticalAlign: 'middle', height: '20px' }}> CS FORM 212 (Revised 2017), Page 3 of 4</td>
          </tr>
        </tbody>
      </table>
      </div>
    </>
  );
};

export default PdsPrintPage3;
