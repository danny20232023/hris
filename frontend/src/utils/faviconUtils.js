// Utility functions for managing favicon
export const setFavicon = (logoDataUrl) => {
  if (!logoDataUrl) {
    // Don't reset to default favicon if no logo - just leave it as is
    return;
  }

  // Create a new favicon link element
  const favicon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.href = logoDataUrl;
  
  // Add to head if it doesn't exist
  if (!document.querySelector('link[rel="icon"]')) {
    document.head.appendChild(favicon);
  }
};

export const setPageTitle = (systemName) => {
  if (systemName) {
    document.title = systemName;
  } else {
    document.title = 'DTR System';
  }
};
