
const API_BASE_URL = 'http://localhost:5000';

export interface UsbDevice {
  vendor_id: string;
  product_id: string;
  whitelisted: boolean;
}

const fetchWithErrorHandling = async (url: string, options?: RequestInit) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      credentials: 'include', // This allows cookies to be sent
      mode: 'cors', // Explicitly set CORS mode
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw new Error('Could not connect to the server. Please ensure the backend is running on http://localhost:5000');
  }
};

export const fetchConnectedDevices = async (): Promise<UsbDevice[]> => {
  const response = await fetchWithErrorHandling(`${API_BASE_URL}/`);
  const html = await response.text();
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
  const response = await fetchWithErrorHandling(`${API_BASE_URL}/logs`);
  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.querySelector('pre')?.textContent || 'No logs available.';
};

export const addToWhitelist = async (vendor_id: string, product_id: string): Promise<void> => {
  const formData = new FormData();
  formData.append('vendor_id', vendor_id);
  formData.append('product_id', product_id);
  
  await fetchWithErrorHandling(`${API_BASE_URL}/whitelist`, {
    method: 'POST',
    body: formData
  });
};

export const blockDevice = async (vendor_id: string, product_id: string): Promise<void> => {
  const formData = new FormData();
  formData.append('vendor_id', vendor_id);
  formData.append('product_id', product_id);
  
  await fetchWithErrorHandling(`${API_BASE_URL}/block`, {
    method: 'POST',
    body: formData
  });
};

