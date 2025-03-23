
// USB service for handling device data and monitoring

// API endpoint URLs - update these with your actual backend server address
const API_BASE_URL = "http://localhost:3001";

// Function to convert hexadecimal IDs if needed
const normalizeHexId = (id) => {
  // Check if the ID is already in the correct format
  if (!id) return "";
  
  // Remove any 0x prefix if present
  let normalizedId = id.toString().replace(/^0x/i, '');
  
  // Ensure it's 4 digits by padding with leading zeros if needed
  while (normalizedId.length < 4) {
    normalizedId = '0' + normalizedId;
  }
  
  return normalizedId;
};

// Real API calls to backend
export const fetchUSBDevices = async () => {
  try {
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

export const addDeviceToWhitelist = async (device) => {
  try {
    // Normalize product and vendor IDs before sending to backend
    const normalizedDevice = {
      ...device,
      productId: normalizeHexId(device.productId),
      vendorId: normalizeHexId(device.vendorId)
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

// Function to determine the client's operating system
const detectClientOS = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.indexOf('win') !== -1) return 'win32';
  if (userAgent.indexOf('mac') !== -1) return 'darwin';
  if (userAgent.indexOf('linux') !== -1) return 'linux';
  
  // Default fallback
  return 'unknown';
};

// Function to manually eject a USB device
export const ejectUSBDevice = async (deviceId) => {
  try {
    // Get the operating system platform info from the client
    const platform = detectClientOS();
    console.log(`Attempting to eject device ${deviceId} on platform: ${platform}`);
    
    // Make the eject request with platform info
    const response = await fetch(`${API_BASE_URL}/api/eject-device/${deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
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

// Function to force refresh USB device list
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
        
        // Normalize IDs in received data if needed
        if (data.newLog && data.newLog.vendorId) {
          data.newLog.vendorId = normalizeHexId(data.newLog.vendorId);
        }
        if (data.newLog && data.newLog.productId) {
          data.newLog.productId = normalizeHexId(data.newLog.productId);
        }
        
        if (data.newBlockedAttempt && data.newBlockedAttempt.vendorId) {
          data.newBlockedAttempt.vendorId = normalizeHexId(data.newBlockedAttempt.vendorId);
        }
        if (data.newBlockedAttempt && data.newBlockedAttempt.productId) {
          data.newBlockedAttempt.productId = normalizeHexId(data.newBlockedAttempt.productId);
        }
        
        // Fix whitelist update data if present
        if (data.whitelistUpdate) {
          data.whitelistUpdate = data.whitelistUpdate.map(device => ({
            ...device,
            vendorId: normalizeHexId(device.vendorId),
            productId: normalizeHexId(device.productId)
          }));
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
