
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
    
    // Ensure device has name field
    const normalizedDevice = {
      ...device,
      productId: normalizedProductId,
      vendorId: normalizedVendorId,
      name: device.name || `Device ${normalizedVendorId}:${normalizedProductId}`
    };
    
    console.log("Adding to whitelist with normalized IDs:", normalizedDevice);
    
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    // First, EXPLICITLY unblock the device (crucial step)
    console.log("CRITICAL: Explicitly triggering unblock operation FIRST");
    try {
      const unblockResponse = await fetch(`${API_BASE_URL}/api/unblock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: normalizedVendorId,
          productId: normalizedProductId
        })
      });
      
      console.log("Unblock response status:", unblockResponse.status);
      const unblockData = await unblockResponse.json();
      console.log("Unblock response data:", unblockData);
      
      if (!unblockResponse.ok) {
        console.warn("Unblock operation returned non-OK status:", unblockResponse.status);
        // Try a second time with a slight delay - this often helps with macOS
        await new Promise(resolve => setTimeout(resolve, 500));
        const secondUnblockResponse = await fetch(`${API_BASE_URL}/api/unblock-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorId: normalizedVendorId,
            productId: normalizedProductId
          })
        });
        console.log("Second unblock attempt status:", secondUnblockResponse.status);
      } else {
        console.log("Pre-emptive unblock successful");
      }
    } catch (unblockError) {
      console.warn("Pre-emptive unblock attempt failed:", unblockError);
      // Continue with whitelist addition even if unblock fails
    }
    
    // Now add to whitelist
    console.log("Sending whitelist addition request with data:", JSON.stringify(normalizedDevice));
    const response = await fetch(`${API_BASE_URL}/api/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedDevice)
    });
    
    console.log("Whitelist addition response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Whitelist addition error:", errorText);
      throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
    }
    
    const result = await response.json();
    console.log("Whitelist addition result:", result);
    
    // CRITICAL: Try unblocking ONE MORE TIME after adding to whitelist
    // This ensures permanent block files are removed
    try {
      console.log("Performing final unblock attempt after whitelist addition");
      await fetch(`${API_BASE_URL}/api/unblock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: normalizedVendorId,
          productId: normalizedProductId
        })
      });
      
      // Also directly attempt to delete the LaunchDaemon plist file
      // This mimics the manual fix you've been doing
      const cleanupResponse = await fetch(`${API_BASE_URL}/api/cleanup-blocking-files`, {
        method: 'POST'
      }).catch(err => console.warn("Cleanup request failed:", err));
      
      console.log("Final cleanup response:", cleanupResponse);
    } catch (finalUnblockError) {
      console.warn("Final unblock attempt failed:", finalUnblockError);
    }
    
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

// Enhanced function to explicitly unblock a USB device with retries
export const unblockUSBDevice = async (vendorId: string, productId: string) => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    const normalizedVendorId = normalizeHexId(vendorId);
    const normalizedProductId = normalizeHexId(productId);
    
    console.log(`Explicitly unblocking device: ${normalizedVendorId}:${normalizedProductId}`);
    
    // First unblock attempt
    let response = await fetch(`${API_BASE_URL}/api/unblock-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        vendorId: normalizedVendorId, 
        productId: normalizedProductId 
      })
    });
    
    if (!response.ok) {
      console.warn(`First unblock attempt failed with status: ${response.status}`);
      
      // Wait a moment and try again
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Second unblock attempt
      response = await fetch(`${API_BASE_URL}/api/unblock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vendorId: normalizedVendorId, 
          productId: normalizedProductId 
        })
      });
      
      if (!response.ok) {
        console.warn(`Second unblock attempt failed with status: ${response.status}`);
      } else {
        console.log("Second unblock attempt succeeded");
      }
    } else {
      console.log("First unblock attempt succeeded");
    }
    
    // CRITICAL: Always make a cleanup request to explicitly remove blocking files
    try {
      const cleanupResponse = await fetch(`${API_BASE_URL}/api/cleanup-blocking-files`, {
        method: 'POST'
      });
      console.log("Cleanup request status:", cleanupResponse.status);
    } catch (cleanupError) {
      console.warn("Cleanup request failed:", cleanupError);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error unblocking USB device:", error);
    throw new Error("Failed to unblock USB device");
  }
};

// New function to directly fix permanent blocking issue
export const cleanupBlockingFiles = async () => {
  try {
    await checkServerHealth();
    const API_BASE_URL = getApiBaseUrl();
    
    console.log("Requesting explicit cleanup of all blocking files");
    
    const response = await fetch(`${API_BASE_URL}/api/cleanup-blocking-files`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error cleaning up blocking files:", error);
    throw new Error("Failed to clean up blocking files");
  }
};
