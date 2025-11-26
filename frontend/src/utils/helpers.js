export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString();
}

export function formatTime(timeStr) {
  const date = new Date(`1970-01-01T${timeStr}Z`);
  return date.toLocaleTimeString();
}