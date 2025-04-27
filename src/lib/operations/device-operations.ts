
import { getApiBaseUrl, checkServerHealth } from '../config/api-config';
import { normalizeHexId, logIdProcessing, detectClientOS } from '../utils/device-utils';

export const fetchUSBDevices = async () => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/api/usb-devices`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Fetched USB device data:", data);
    return data;
  } catch (error) {
    console.error("Error fetching USB devices:", error);
    throw new Error("Failed to fetch USB devices");
  }
};

export const addDeviceToWhitelist = async (device: any) => {
  try {
    const normalizedProductId = normalizeHexId(device.productId);
    const normalizedVendorId = normalizeHexId(device.vendorId);
    
    logIdProcessing("Product", device.productId, normalizedProductId);
    logIdProcessing("Vendor", device.vendorId, normalizedVendorId);
    
    const normalizedDevice = {
      ...device,
      productId: normalizedProductId,
      vendorId: normalizedVendorId
    };
    
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_BASE_URL}/api/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedDevice)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error adding device to whitelist:", error);
    throw new Error("Failed to add device to whitelist");
  }
};

// ... Implement other device operations (removeDeviceFromWhitelist, blockUSBDeviceClass, etc.)
