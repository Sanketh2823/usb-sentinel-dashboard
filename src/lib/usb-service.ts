// USB service for handling device data and monitoring

// API endpoint URLs - update these with your actual backend server address
const API_BASE_URL = "http://localhost:3001";

// Function to convert hexadecimal IDs
const normalizeHexId = (id) => {
  // Return empty string if no ID provided
  if (!id) return "";
  
  // Convert to string if not already and remove any 0x prefix
  let normalizedId = id.toString().replace(/^0x/i, '');
  
  // Ensure correct format without modifying the original ID too much
  // Some systems report IDs with actual values like 050ac
  // We should preserve this format rather than forcing to 4 digits
  
  // If ID looks like system raw ID (no leading zeros trimmed by parseInt),
  // return it directly without padding
  if (normalizedId.length >= 4) {
    return normalizedId;
  }
  
  // Otherwise pad to at least 4 digits for standard format
  while (normalizedId.length < 4) {
    normalizedId = '0' + normalizedId;
  }
  
  return normalizedId;
};

// Helper to log ID processing for debugging
const logIdProcessing = (type, original, normalized) => {
  console.log(`${type} ID conversion: Original=${original}, Normalized=${normalized}`);
};

// Real API calls to backend
export const fetchUSBDevices = async () => {
  try {
    console.log("Fetching USB devices from API...");
    const response = await fetch(`${API_BASE_URL}/api/usb-devices`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Fetched USB device data:", data);
    
    // Verify IDs are properly formatted in the response
    if (data.whitelistedDevices && Array.isArray(data.whitelistedDevices)) {
      data.whitelistedDevices.forEach(device => {
        console.log(`Device from API: productId=${device.productId}, vendorId=${device.vendorId}`);
      });
    }
    
    return data;
  } catch (error) {
    console.error("Error fetching USB devices:", error);
    throw new Error("Failed to fetch USB devices");
  }
};

export const addDeviceToWhitelist = async (device) => {
  try {
    // Log original values
    console.log("Original device IDs:", {
      productId: device.productId,
      vendorId: device.vendorId
    });
    
    // Normalize product and vendor IDs before sending to backend
    const normalizedProductId = normalizeHexId(device.productId);
    const normalizedVendorId = normalizeHexId(device.vendorId);
    
    // Log the normalized values
    logIdProcessing("Product", device.productId, normalizedProductId);
    logIdProcessing("Vendor", device.vendorId, normalizedVendorId);
    
    const normalizedDevice = {
      ...device,
      productId: normalizedProductId,
      vendorId: normalizedVendorId
    };
    
    console.log("Adding device to whitelist:", normalizedDevice);
    
    const response = await fetch(`${API_BASE_URL}/api/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedDevice)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error adding device to whitelist:", error);
    throw new Error("Failed to add device to whitelist");
  }
};

export const removeDeviceFromWhitelist = async (deviceId) => {
  try {
    console.log(`Removing device from whitelist with ID: ${deviceId}`);
    const response = await fetch(`${API_BASE_URL}/api/whitelist/${deviceId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Device removal response:", data);
    return data;
  } catch (error) {
    console.error("Error removing device from whitelist:", error);
    throw new Error("Failed to remove device from whitelist");
  }
};

export const fetchAllowedDeviceClasses = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/allowed-classes`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching allowed device classes:", error);
    throw new Error("Failed to fetch allowed device classes");
  }
};

export const updateAllowedDeviceClasses = async (allowedClasses) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/allowed-classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allowedClasses)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating allowed device classes:", error);
    throw new Error("Failed to update allowed device classes");
  }
};

// New function to block a specific USB device class
export const blockUSBDeviceClass = async (classId) => {
  try {
    console.log(`Attempting to block USB device class: ${classId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/block-usb-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Block USB class response:", data);
    return data;
  } catch (error) {
    console.error("Error blocking USB class:", error);
    throw new Error(error.message || "Failed to block USB class");
  }
};

// Enhanced function to force block a USB device (more aggressive than ejection)
export const forceBlockUSBDevice = async (deviceId) => {
  try {
    // Extract vendorId and productId from deviceId
    let vendorId, productId;
    
    if (typeof deviceId === 'object' && deviceId !== null) {
      // If deviceId is an object with vendorId and productId properties
      vendorId = deviceId.vendorId;
      productId = deviceId.productId;
    } else if (typeof deviceId === 'string' && deviceId.includes(':')) {
      // If deviceId is a string in the format "vendorId:productId"
      [vendorId, productId] = deviceId.split(':');
    } else {
      throw new Error("Invalid device identifier format");
    }
    
    // Get the operating system platform info from the client
    const platform = detectClientOS();
    console.log(`Attempting to force block device ${vendorId}:${productId} on platform: ${platform}`);
    
    // Make the block request with vendorId and productId
    const response = await fetch(`${API_BASE_URL}/api/force-block-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId, productId })
    });
    
    console.log("Force block response status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Force block error response:", errorData);
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Force block device response:", data);
    
    return data;
  } catch (error) {
    console.error("Error force blocking USB device:", error);
    throw new Error(error.message || "Failed to force block USB device");
  }
};

export const ejectUSBDevice = async (deviceId) => {
  try {
    // Extract vendorId and productId from deviceId
    let vendorId, productId;
    
    if (typeof deviceId === 'object' && deviceId !== null) {
      // If deviceId is an object with vendorId and productId properties
      vendorId = deviceId.vendorId;
      productId = deviceId.productId;
    } else if (typeof deviceId === 'string' && deviceId.includes(':')) {
      // If deviceId is a string in the format "vendorId:productId"
      [vendorId, productId] = deviceId.split(':');
    } else {
      throw new Error("Invalid device identifier format");
    }
    
    // Get the operating system platform info from the client
    const platform = detectClientOS();
    console.log(`Attempting to eject device ${vendorId}:${productId} on platform: ${platform}`);
    
    // Make the eject request with vendorId and productId
    const response = await fetch(`${API_BASE_URL}/api/eject-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId, productId })
    });
    
    // Log full response for debugging
    console.log("Eject response status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Eject error response:", errorData);
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Eject device response:", data);
    return data;
  } catch (error) {
    console.error("Error ejecting USB device:", error);
    throw new Error(error.message || "Failed to eject USB device");
  }
};

export const refreshUSBDevices = async () => {
  try {
    // Get the operating system platform info from the client
    const platform = detectClientOS();
    console.log(`Refreshing USB devices on platform: ${platform}`);
    
    // Make the refresh request with platform info
    const response = await fetch(`${API_BASE_URL}/api/refresh-devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Refresh error response:", errorData);
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Refresh devices response:", data);
    return data;
  } catch (error) {
    console.error("Error refreshing USB devices:", error);
    throw new Error(error.message || "Failed to refresh USB devices");
  }
};

// Function to determine the client's operating system
const detectClientOS = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.indexOf('win') !== -1) return 'win32';
  if (userAgent.indexOf('mac') !== -1) return 'darwin';
  if (userAgent.indexOf('linux') !== -1) return 'linux';
  
  // Default fallback
  return 'unknown';
};

// New function to check system permissions
export const checkSystemPermissions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/system-permissions`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("System permissions check:", data);
    return data;
  } catch (error) {
    console.error("Error checking system permissions:", error);
    throw new Error("Failed to check system permissions");
  }
};

// New function to check admin privileges
export const checkAdminPrivileges = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin-check`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Admin privileges check:", data);
    return data;
  } catch (error) {
    console.error("Error checking admin privileges:", error);
    throw new Error("Failed to check admin privileges");
  }
};

// Real-time monitoring using WebSocket
export const monitorUSBPorts = async (callback) => {
  try {
    const socket = new WebSocket(`ws://localhost:3001/usb-events`);
    
    socket.onopen = () => {
      console.log("WebSocket connection established for USB monitoring");
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket data:", data);
        
        // Log original values before normalization
        if (data.newLog && data.newLog.vendorId) {
          console.log(`WebSocket log original vendorId: ${data.newLog.vendorId}, productId: ${data.newLog.productId}`);
        }
        
        // Log original values for blocked attempts
        if (data.newBlockedAttempt && data.newBlockedAttempt.vendorId) {
          console.log(`WebSocket blocked attempt original vendorId: ${data.newBlockedAttempt.vendorId}, productId: ${data.newBlockedAttempt.productId}`);
        }
        
        // Normalize IDs in received data if needed
        if (data.newLog && data.newLog.vendorId) {
          // Keep original value if it's already in correct format
          data.newLog.vendorId = data.newLog.vendorId;
        }
        if (data.newLog && data.newLog.productId) {
          // Keep original value if it's already in correct format
          data.newLog.productId = data.newLog.productId;
        }
        
        if (data.newBlockedAttempt && data.newBlockedAttempt.vendorId) {
          // Keep original value if it's already in correct format
          data.newBlockedAttempt.vendorId = data.newBlockedAttempt.vendorId;
        }
        if (data.newBlockedAttempt && data.newBlockedAttempt.productId) {
          // Keep original value if it's already in correct format
          data.newBlockedAttempt.productId = data.newBlockedAttempt.productId;
        }
        
        // Fix whitelist update data if present
        if (data.whitelistUpdate) {
          console.log("Original whitelist update data:", JSON.stringify(data.whitelistUpdate));
          
          // Keep original values as they should already be correct from the server
          data.whitelistUpdate = data.whitelistUpdate;
          
          console.log("Normalized whitelist update data:", JSON.stringify(data.whitelistUpdate));
        }
        
        callback(data);
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };
    
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket connection closed: ${event.reason}`);
    };
    
    return {
      unsubscribe: () => {
        console.log("Closing WebSocket connection");
        socket.close();
      }
    };
  } catch (error) {
    console.error("Error setting up WebSocket connection:", error);
    throw new Error("Failed to establish WebSocket connection for USB monitoring");
  }
};
