// Appointment lookup table for USERINFO.Appointment column
// This file maps appointment integer values to their corresponding names

export const APPOINTMENT_TYPES = {
  1: 'Regular',
  2: 'Casual', 
  3: 'Co-Terminus',
  4: 'Provisional',
  5: 'Job Order (JO)',
  6: 'Project Based (PB)',
  7: 'Special Engaged (SE)',
  8: 'Others'
};

// Function to get appointment name by ID
export const getAppointmentName = (appointmentId) => {
  const id = parseInt(appointmentId);
  return APPOINTMENT_TYPES[id] || 'Unknown';
};

// Function to get all appointment types for dropdown/select options
export const getAppointmentOptions = () => {
  return Object.entries(APPOINTMENT_TYPES).map(([id, name]) => ({
    id: parseInt(id),
    name: name
  }));
};

// Function to get appointment short name (for grid display)
export const getAppointmentShortName = (appointmentId) => {
  const id = parseInt(appointmentId);
  const shortNames = {
    1: 'Regular',
    2: 'Casual',
    3: 'Co-Terminus',
    4: 'Provisional', 
    5: 'JO',
    6: 'PB',
    7: 'SE',
    8: 'Others'
  };
  return shortNames[id] || 'Unknown';
};

export default {
  APPOINTMENT_TYPES,
  getAppointmentName,
  getAppointmentOptions,
  getAppointmentShortName
};