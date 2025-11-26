import React from 'react';

const PdsPrintPage4 = ({ 
  declarations = {}, 
  references = [], 
  governmentIds = [], 
  signatureData = '', 
  photoData = '', 
  thumbmarkData = '', 
  dateAccomplished = '', 
  displayValue, 
  displayYesNo, 
  formatDate,
  formData = {}
}) => {
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
            .yes-no-box {
              font-size: 20px !important;
              font-weight: bold !important;
              color: #000 !important;
              display: inline-block !important;
              margin-right: 8px !important;
              width: 20px !important;
              height: 20px !important;
              text-align: center !important;
              line-height: 18px !important;
              border: 2px solid #000 !important;
              background-color: #fff !important;
              vertical-align: middle !important;
            }
            .checkbox-large {
              width: 20px !important;
              height: 20px !important;
              border: 2px solid #000 !important;
              background-color: #fff !important;
              display: inline-block !important;
              margin-right: 8px !important;
              vertical-align: middle !important;
              position: relative !important;
            }
            .checkbox-large.checked::after {
              content: 'X' !important;
              position: absolute !important;
              top: 50% !important;
              left: 50% !important;
              transform: translate(-50%, -50%) !important;
              font-size: 16px !important;
              font-weight: 900 !important;
              color: #000 !important;
              z-index: 10 !important;
              display: block !important;
              line-height: 1 !important;
              text-shadow: none !important;
            }
            .checkbox-large.checked {
              background-color: #f0f0f0 !important;
              border: 3px solid #000 !important;
            }
            .photo-box {
              border: 1px solid #000;
              padding: 5px;
              display: inline-block;
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
      {/* Declarations Table */}
      <table 
        className="pds-table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '9px',
          marginBottom: '0.01in',
          whiteSpace: 'normal',
          wordWrap: 'break-word'
        }}
      >
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan="3" className="section-title" style={{ textAlign:'left',fontWeight: 'bold', fontSize: '14px', padding: '8px 0', backgroundColor: '#f0f0f0' }}>
              &nbsp;&nbsp;IX. DECLARATIONS
            </td>
          </tr>
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>34. Are you related by consanguinity or affinity to the appointing or recommending authority, or to the chief of bureau or office or to the person who has immediate supervision over you in the Office, Bureau or Department where you will be apppointed,  </td>
            <td className="field-label" style={{ textAlign:'center', verticalAlign:'middle'}}></td>
            <td className="field-label" style={{ textAlign:'center', verticalAlign:'middle'}}></td>
          </tr>
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>a. within the third degree?</td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
                    <div className="checkbox-large" style={{ 
                      width: '10px', 
                      height: '10px', 
                      border: '1px solid #000', 
                      backgroundColor: declarations.third_degree ? '#f0f0f0' : '#fff',
                      display: 'inline-block',
                      marginRight: '4px',
                      verticalAlign: 'middle',
                      textAlign: 'center',
                      lineHeight: '8px',
                      fontSize: '8px',
                      fontWeight: 'bold'
                    }}>
                      {declarations.third_degree ? '✓' : ''}
                    </div> YES
                  </td>
                  <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
                    <div className="checkbox-large" style={{ 
                    width: '10px', 
                    height: '10px', 
                    border: '1px solid #000', 
                    backgroundColor: (!declarations.third_degree && declarations.third_degree !== undefined) ? '#f0f0f0' : '#fff',
                    display: 'inline-block',
                    marginRight: '4px',
                    verticalAlign: 'middle',
                    textAlign: 'center',
                    lineHeight: '8px',
                    fontSize: '8px',
                    fontWeight: 'bold'
                    }}>
                      {(!declarations.third_degree && declarations.third_degree !== undefined) ? '✓' : ''}
                    </div> NO
                  </td>
            </tr>
          
         
          
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>b. within the fourth degree? (for Local Government Unit - Career Employees)</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.fourth_degree ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.fourth_degree ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.fourth_degree && declarations.fourth_degree !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.fourth_degree && declarations.fourth_degree !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr>
            <td  className="field-label" style={{ verticalAlign:'middle'}}> </td>
            <td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td>
            
          </tr>
          
          
            <tr style={{height:'28px'}}>      
              <td></td>                                            
              <td  className="field-value" style={{ verticalAlign:'middle'}}>{displayValue(declarations.thirtyfour_b_details)}</td>
              <td></td>
            </tr>
         
          
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>35. a. Have you ever been found guilty of any administrative offense?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.thirtyfive_a ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.thirtyfive_a ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.thirtyfive_a && declarations.thirtyfive_a !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.thirtyfive_a && declarations.thirtyfive_a !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td></td><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
            
            <tr style={{height:'28px'}}>  
              <td></td>                                                
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>{displayValue(declarations.thirtyfive_a_details)}</td>
           </tr>
          

            <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>b. Have you been criminally charged before any court?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.criminally_charged ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.criminally_charged ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.criminally_charged && declarations.criminally_charged !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.criminally_charged && declarations.criminally_charged !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td></td><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>BIf YES, give details: </td></tr>
          
            <tr style={{height:'28px'}}>
              <td></td>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.thirtyfive_datefiled)}</td>
              <td></td> 
           </tr>                             
            <tr style={{height:'28px'}}> 
              <td></td>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Status of Case/s: {displayValue(declarations.thirtyfive_statuses)}</td>
              <td></td> 
           </tr>
          
          
          <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>36. Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.convicted ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.convicted ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.convicted && declarations.convicted !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.convicted && declarations.convicted !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
          )}
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>37. Have you ever been separated from the service in any of the following modes?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.separated_service ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.separated_service ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.separated_service && declarations.separated_service !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.separated_service && declarations.separated_service !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
          )}
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>38. a. Have you ever been a candidate in a national or local election held within the last year?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.candidate ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.candidate ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.candidate && declarations.candidate !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.candidate && declarations.candidate !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
          )}
          <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>b. Have you resigned from the government service during the three (3)-month period before the last election to promote/actively campaign for a national or local candidate?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.candidate ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.candidate ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.candidate && declarations.candidate !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.candidate && declarations.candidate !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
           </tr>
          )}
          <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>39. Have you acquired the status of an immigrant or permanent resident of another country?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.indigenous_group ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.indigenous_group ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
           </tr>
          )}
          <tr style={{height:'28px'}}>
            <td className="field-label" style={{ verticalAlign:'middle'}}>40. Pursuant to: (a) Indigenous People's Act (RA 8371); (b) Magna Carta for Disabled Persons (RA 7277); and (c) Solo Parents Welfare Act of 2000 (RA 8972), please answer the following items:</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.pwd ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.pwd ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.pwd && declarations.pwd !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.pwd && declarations.pwd !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>a. Are you a member of any indigenous group?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.indigenous_group ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.indigenous_group ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
      
          )}
          
          <tr style={{height:'28px'}}>
            <td className="field-label"   style={{ verticalAlign:'middle'}}>b. Are you a person with disability?</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.indigenous_group ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.indigenous_group ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
      
          )}

            <tr style={{height:'28px'}}>
            <td className="field-label"  style={{ verticalAlign:'middle'}}>c. Are you a solo parent??</td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: declarations.indigenous_group ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {declarations.indigenous_group ? '✓' : ''}
              </div> YES
            </td>
            <td className="field-value" style={{ textAlign:'center', verticalAlign:'middle'}}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                border: '1px solid #000', 
                backgroundColor: (!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '#f0f0f0' : '#fff',
                display: 'inline-block',
                marginRight: '4px',
                verticalAlign: 'middle',
                textAlign: 'center',
                lineHeight: '8px',
                fontSize: '8px',
                fontWeight: 'bold'
              }}>
                  {(!declarations.indigenous_group && declarations.indigenous_group !== undefined) ? '✓' : ''}
              </div> NO
            </td>
          </tr>
          
          <tr><td  className="field-label" colspan="2" style={{ verticalAlign:'middle'}}>If YES, give details: </td></tr>
          {declarations.fourth_degree && declarations.fourth_degree_details && (
            <tr style={{height:'28px'}}>                                                  
              <td  className="field-value" colspan="2" style={{ verticalAlign:'middle'}}>Date Filed:  {displayValue(declarations.fourth_degree_details)}</td>
            </tr>
      
          )}
        </tbody>
      </table>

      

      {/* 4-Column Table Structure */}
      <table className="pds-table" style={{ 
        marginTop: '3px',
        tableLayout: 'fixed',
        width: '100%'
      }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="field-label" colspan="3" style={{ textAlign: 'left', verticalAlign: 'middle', height: '30px', fontSize:'11px'}}>41. REFERENCES  (Person not related by consanguinity or affinity to applicant /appointee)</td>
             <td className="field-label" rowspan="5" style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' }}>
               <div style={{ 
                 border: '1px solid #000', 
                 height: '120px', 
                 width: '90px', 
                 margin: '0 auto',
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 backgroundColor: '#f9f9f9'
               }}>
                 {photoData ? (
                   <img src={photoData} alt="Employee Photo" style={{ maxWidth: '85px', maxHeight: '115px', objectFit: 'cover' }} />
                 ) : (
                   <div style={{ color: '#999', fontSize: '10px', textAlign: 'center' }}>Photo<br/>(Passport Size)</div>
                 )}
               </div>
             </td>
            </tr>
          {/* Display up to 3 references */}
          {Array.from({ length: 3 }, (_, index) => {
            const ref = references[index] || {};
            const hasRef = references[index] !== undefined && ref !== null;
            return (
              <tr key={index} style={{ height: '40px' }}>
                <td className="field-value" style={{ textAlign: 'left', verticalAlign: 'middle' }}>
                  {hasRef ? displayValue(ref.reference_name) : ''}
                </td>
                <td className="field-value" style={{ textAlign: 'left', verticalAlign: 'middle' }}>
                  {hasRef ? displayValue(ref.reference_address) : ''}
                </td>
                <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  {hasRef ? displayValue(ref.reference_tel_no) : ''}
                </td>
                
              </tr>
            );
          })}
           <tr><td  className="field-label" colspan="3" style={{ textAlign:'justify',verticalAlign:'middle'}}>42. I declare under oath that I have personally accomplished this Personal Data Sheet which is a true, correct and complete statement pursuant to the provisions of pertinent laws, rules and regulations of the Republic of the Philippines. I authorize the agency head/authorized representative to verify/validate the contents stated herein. I agree that any misrepresentation made in this document and its attachments shall cause the filing of administrative/criminal case/s against me.</td></tr>
          </tbody>
        </table>

      {/* Government ID Section - 4 Column Table */}
      <table className="pds-table" style={{ 
        marginTop: '3px',
        tableLayout: 'fixed',
        width: '100%'
      }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '46%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="field-label"  style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px', fontSize:'9px'}}>
            Government Issued ID   <br></br>(i.e.Passport, GSIS, SSS, PRC, Driver's License, etc.)     
            </td>
            <td className="field-label"  style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px', fontSize:'8px' }}>
              
            PLEASE INDICATE ID Number and Date of Issuance
            </td>
           
            
             <td className="field-label" rowspan="4" style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' }}>
               <div style={{ 
                 border: '1px solid #000', 
                 height: '80px', 
                 width: '200px', 
                 margin: '0 auto',
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 backgroundColor: '#f9f9f9'
               }}>
                 {signatureData ? (
                   <img src={signatureData} alt="Signature" style={{ maxWidth: '190px', maxHeight: '75px', objectFit: 'contain' }} />
                 ) : (
                   <div style={{ color: '#999', fontSize: '10px', textAlign: 'center' }}>Signature</div>
                 )}
               </div>
             </td>
             <td className="field-label" rowspan="6" style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' }}>
               <div style={{ 
                 border: '1px solid #000', 
                 height: '144px', 
                 width: '144px', 
                 margin: '0 auto',
                 display: 'flex', 
                 alignItems: 'center', 
                 justifyContent: 'center',
                 backgroundColor: '#f9f9f9'
               }}>
                 {thumbmarkData ? (
                   <img src={thumbmarkData} alt="Thumbmark" style={{ maxWidth: '140px', maxHeight: '140px', objectFit: 'contain' }} />
                 ) : (
                   <div style={{ color: '#999', fontSize: '10px', textAlign: 'center' }}>Thumbmark<br/>(2" x 2")</div>
                 )}
               </div>
             </td>
          </tr>
          <tr>
            <td className="field-label" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' , fontSize:'10px'}}>
            Government Issued ID:       
            </td>
            <td className="field-value" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' , fontSize:'9px' }}>
              {governmentIds.length > 0 ? displayValue(governmentIds[0]?.government_issued_id) : '_____'}
            </td>
            
          </tr>
          <tr>
            
            
          </tr>
          <tr>
            <td className="field-label" rowspan="2"style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' , fontSize:'10px'}}>ID/License/Passport No.:       
            </td>
            <td className="field-value" rowspan="2" style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' , fontSize:'9px'}}>
              {governmentIds.length > 0 ? displayValue(governmentIds[0]?.id_number) : '_____'}
            </td>
            
          </tr>
          <tr>
            
            <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '9px' , fontSize:'9px' }}>Signature (Sign inside the box)</td>
            
            
            </tr>
            <tr>
            <td className="field-label" rowspan="2"style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' , fontSize:'10px' }}>
            Date/Place of Issuance:      
            </td>
            <td className="field-value" rowspan="2"style={{ textAlign: 'center', verticalAlign: 'middle', height: '40px' , fontSize:'9px'}}>
              {governmentIds.length > 0 ? formatDate(governmentIds[0]?.date_issued) : '____'} / {governmentIds.length > 0 ? displayValue(governmentIds[0]?.place_of_issuance) : '_________________'}
            </td>
            <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '20px', fontSize: '9px' }}>
              {displayValue(dateAccomplished) || '_________________'}
            </td>
            
            </tr>
          <tr>
            
            <td className="field-label" style={{ textAlign: 'center', verticalAlign: 'middle', height: '15x' }}> Date Accomplished</td>
            <td className="field-value" style={{ textAlign: 'center', verticalAlign: 'middle', height: '15px' }}>Right Thumbmark</td>
            
              </tr>
          </tbody>
        </table>


      {/* Oath Section */}
      <table className="pds-table" style={{ marginTop: '3px' }}>
        <tbody>
          <tr>
            <td className="field-label" style={{ padding: '10px', textAlign: 'left', verticalAlign: 'top', fontSize:'10px' }}>
              SUBSCRIBED AND SWORN to before me this ___________________________, affiant exhibiting his/her validly issued government ID as indicated above.
            </td>
          </tr>
          <tr>
            <td style={{ padding: '20px', textAlign: 'center', verticalAlign: 'top', borderBottom: '1px solid #000' }}>
              <div style={{ border: '0px solid #000', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '3px' }}>
              <div style={{ textAlign: 'center' }}>
                  <br></br>
                  <br></br>
                  <br></br>
                  <br></br>
                  <br></br>
                  
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>____insert here the municipal mayor's name__________________</div>
                  <div style={{ fontSize: '10px', marginTop: '3px' }}>Person Administering Oath</div>
                </div>
              </div>
            </td>
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
          marginBottom: '0.01in',
          whiteSpace: 'normal',
          wordWrap: 'break-word',
          marginTop: '0.01n'
        }}
      >
        <colgroup>
          <col style={{ width: '18.5%' }} />
          <col style={{ width: '46.5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          {/* Row 3: Page marking */}
          <tr>
            <td className="field-label" colspan="4" style={{ textAlign: 'right', verticalAlign: 'middle', height: '20px' }}> CS FORM 212 (Revised 2017), Page 4 of 4</td>
          </tr>
        </tbody>
      </table>
        </div>
    </>
  );
};

export default PdsPrintPage4;

