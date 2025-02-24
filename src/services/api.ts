
const API_BASE_URL = 'http://localhost:5000';

export interface UsbDevice {
  vendor_id: string;
  product_id: string;
  whitelisted: boolean;
}

export const fetchConnectedDevices = async (): Promise<UsbDevice[]> => {
  const response = await fetch(`${API_BASE_URL}/`);
  const html = await response.text();
  // Parse devices from HTML response (temporary solution)
  // In production, the backend should return JSON instead
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('table tbody tr');
  
  return Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td');
    return {
      vendor_id: cells[0].textContent || '',
      product_id: cells[1].textContent || '',
      whitelisted: row.querySelector('.block-btn') !== null
    };
  });
};

export const fetchLogs = async (): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/logs`);
  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.querySelector('pre')?.textContent || 'No logs available.';
};

export const addToWhitelist = async (vendor_id: string, product_id: string): Promise<void> => {
  const formData = new FormData();
  formData.append('vendor_id', vendor_id);
  formData.append('product_id', product_id);
  
  await fetch(`${API_BASE_URL}/whitelist`, {
    method: 'POST',
    body: formData
  });
};

export const blockDevice = async (vendor_id: string, product_id: string): Promise<void> => {
  const formData = new FormData();
  formData.append('vendor_id', vendor_id);
  formData.append('product_id', product_id);
  
  await fetch(`${API_BASE_URL}/block`, {
    method: 'POST',
    body: formData
  });
};
