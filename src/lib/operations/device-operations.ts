
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
    
    console.log("Adding to whitelist with normalized IDs:", normalizedDevice);
    
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    // First, try explicitly triggering the unblock operation
    try {
      console.log("Pre-emptively triggering unblock operation");
      const unblockResponse = await fetch(`${API_BASE_URL}/api/unblock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: normalizedVendorId,
          productId: normalizedProductId
        })
      });
      
      if (unblockResponse.ok) {
        console.log("Pre-emptive unblock successful");
      } else {
        console.warn("Pre-emptive unblock returned non-OK status:", unblockResponse.status);
      }
    } catch (unblockError) {
      console.warn("Pre-emptive unblock attempt failed:", unblockError);
      // Continue with whitelist addition even if unblock fails
    }
    
    // Now add to whitelist
    const response = await fetch(`${API_BASE_URL}/api/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedDevice)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log("Whitelist addition result:", result);
    
    return result;
  } catch (error) {
    console.error("Error adding device to whitelist:", error);
    throw new Error("Failed to add device to whitelist");
  }
};

export const removeDeviceFromWhitelist = async (deviceId: number) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_BASE_URL}/api/whitelist/${deviceId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error removing device from whitelist:", error);
    throw new Error("Failed to remove device from whitelist");
  }
};

export const fetchAllowedDeviceClasses = async () => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_BASE_URL}/api/allowed-classes`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching allowed device classes:", error);
    throw new Error("Failed to fetch allowed device classes");
  }
};

export const updateAllowedDeviceClasses = async (allowedClasses: any[]) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_BASE_URL}/api/allowed-classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allowedClasses)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error updating allowed device classes:", error);
    throw new Error("Failed to update allowed device classes");
  }
};

export const forceBlockUSBDevice = async (vendorId: string, productId: string) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const normalizedVendorId = normalizeHexId(vendorId);
    const normalizedProductId = normalizeHexId(productId);
    
    console.log(`Force blocking device: ${normalizedVendorId}:${normalizedProductId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/force-block-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        vendorId: normalizedVendorId, 
        productId: normalizedProductId 
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error force blocking USB device:", error);
    throw new Error("Failed to force block USB device");
  }
};

export const blockUSBDeviceClass = async (classId: string) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_BASE_URL}/api/block-usb-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error blocking USB device class:", error);
    throw new Error("Failed to block USB device class");
  }
};

// New function to explicitly unblock a USB device
export const unblockUSBDevice = async (vendorId: string, productId: string) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const normalizedVendorId = normalizeHexId(vendorId);
    const normalizedProductId = normalizeHexId(productId);
    
    console.log(`Explicitly unblocking device: ${normalizedVendorId}:${normalizedProductId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/unblock-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        vendorId: normalizedVendorId, 
        productId: normalizedProductId 
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error unblocking USB device:", error);
    throw new Error("Failed to unblock USB device");
  }
};

// Additional device operations can be implemented here
