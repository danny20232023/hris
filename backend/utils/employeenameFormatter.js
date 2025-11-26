/**
 * Employee Name Formatter Utility
 * 
 * Centralized utility for formatting employee names to Title Case
 * regardless of how they are stored in the database or arranged in the UI.
 */

/**
 * Converts a string to Title Case (first letter uppercase, rest lowercase)
 * @param {string} str - String to convert
 * @returns {string} - Title Case string
 */
const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(word => word.length > 0)
    .join(' ');
};

/**
 * Formats employee name from individual parts
 * @param {string} surname - Last name
 * @param {string} firstname - First name
 * @param {string} middlename - Middle name (optional)
 * @param {string} extension - Name extension like Jr., Sr., III (optional)
 * @returns {string} - Formatted name in "Last Name, First Name Middle Name" format with Title Case
 */
const formatEmployeeName = (surname, firstname, middlename = null, extension = null) => {
  const clean = (value) => (value || '').trim();
  
  const last = toTitleCase(clean(surname));
  const first = toTitleCase(clean(firstname));
  const middle = toTitleCase(clean(middlename));
  const ext = clean(extension);
  
  if (!last && !first) {
    return '';
  }
  
  let formattedName = '';
  
  if (last && first) {
    formattedName = `${last}, ${first}`;
    if (middle) {
      formattedName += ` ${middle}`;
    }
    if (ext) {
      formattedName += ` ${ext}`;
    }
  } else {
    // Fallback if format is incomplete
    formattedName = [last, first, middle, ext].filter(Boolean).join(' ');
  }
  
  return formattedName.trim();
};

/**
 * Parses and formats a pre-formatted name string
 * Handles various input formats and normalizes to "Last Name, First Name Middle Name"
 * @param {string} fullNameString - Pre-formatted name string (e.g., "DANNY RUSSELL LUMAAYAG" or "LUMAAYAG, DANNY RUSSELL")
 * @param {string} format - Format hint: 'auto', 'LastFirst', 'FirstLast' (default: 'auto')
 * @returns {string} - Formatted name in "Last Name, First Name Middle Name" format with Title Case
 */
const formatEmployeeNameFromString = (fullNameString, format = 'auto') => {
  if (!fullNameString || typeof fullNameString !== 'string') {
    return '';
  }
  
  const cleaned = fullNameString.trim();
  if (!cleaned) {
    return '';
  }
  
  // Check if it contains a comma (likely "Last, First Middle" format)
  const hasComma = cleaned.includes(',');
  
  let parts = [];
  let surname = '';
  let firstname = '';
  let middlename = '';
  let extension = '';
  
  if (hasComma) {
    // Format: "Last, First Middle" or "Last, First Middle Extension"
    const [lastPart, ...restParts] = cleaned.split(',').map(p => p.trim());
    surname = lastPart;
    
    if (restParts.length > 0) {
      const nameParts = restParts.join(' ').trim().split(/\s+/);
      firstname = nameParts[0] || '';
      
      // Check if last part is an extension (Jr., Sr., III, etc.)
      const lastPartLower = (nameParts[nameParts.length - 1] || '').toLowerCase();
      const isExtension = /^(jr|sr|ii|iii|iv|v|esq|phd|md)$/i.test(lastPartLower) || 
                         /^(jr\.|sr\.|esq\.|phd\.|md\.)$/i.test(lastPartLower);
      
      if (isExtension && nameParts.length > 1) {
        extension = nameParts[nameParts.length - 1];
        middlename = nameParts.slice(1, -1).join(' ');
      } else {
        middlename = nameParts.slice(1).join(' ');
      }
    }
  } else {
    // Format: "First Middle Last" or "Last First Middle"
    // Try to detect format based on common patterns
    const nameParts = cleaned.split(/\s+/).filter(p => p.length > 0);
    
    if (format === 'FirstLast' || (format === 'auto' && nameParts.length >= 2)) {
      // Assume "First Middle Last" format
      firstname = nameParts[0] || '';
      if (nameParts.length === 2) {
        surname = nameParts[1] || '';
      } else if (nameParts.length >= 3) {
        // Check if last part is an extension
        const lastPartLower = nameParts[nameParts.length - 1].toLowerCase();
        const isExtension = /^(jr|sr|ii|iii|iv|v|esq|phd|md)$/i.test(lastPartLower) || 
                           /^(jr\.|sr\.|esq\.|phd\.|md\.)$/i.test(lastPartLower);
        
        if (isExtension) {
          extension = nameParts[nameParts.length - 1];
          surname = nameParts[nameParts.length - 2] || '';
          middlename = nameParts.slice(1, -2).join(' ');
        } else {
          surname = nameParts[nameParts.length - 1] || '';
          middlename = nameParts.slice(1, -1).join(' ');
        }
      }
    } else if (format === 'LastFirst') {
      // Assume "Last First Middle" format
      surname = nameParts[0] || '';
      firstname = nameParts[1] || '';
      if (nameParts.length > 2) {
        // Check if last part is an extension
        const lastPartLower = nameParts[nameParts.length - 1].toLowerCase();
        const isExtension = /^(jr|sr|ii|iii|iv|v|esq|phd|md)$/i.test(lastPartLower) || 
                           /^(jr\.|sr\.|esq\.|phd\.|md\.)$/i.test(lastPartLower);
        
        if (isExtension) {
          extension = nameParts[nameParts.length - 1];
          middlename = nameParts.slice(2, -1).join(' ');
        } else {
          middlename = nameParts.slice(2).join(' ');
        }
      }
    } else {
      // Auto-detect: if first word looks like a common first name pattern, assume FirstLast
      // Otherwise, assume LastFirst
      // Simple heuristic: if first part is very short (1-2 chars), might be initial, assume LastFirst
      const firstPart = nameParts[0] || '';
      if (firstPart.length <= 2 && nameParts.length >= 2) {
        // Likely "Last First Middle" format
        surname = firstPart;
        firstname = nameParts[1] || '';
        middlename = nameParts.slice(2).join(' ');
      } else {
        // Likely "First Middle Last" format
        firstname = firstPart;
        if (nameParts.length === 2) {
          surname = nameParts[1] || '';
        } else if (nameParts.length >= 3) {
          surname = nameParts[nameParts.length - 1] || '';
          middlename = nameParts.slice(1, -1).join(' ');
        }
      }
    }
  }
  
  return formatEmployeeName(surname, firstname, middlename, extension);
};

export {
  formatEmployeeName,
  formatEmployeeNameFromString,
  toTitleCase
};

