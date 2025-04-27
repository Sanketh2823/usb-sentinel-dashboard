// USB service for handling device data and monitoring

// API endpoint URLs - use a function to get the current URL dynamically
const getApiBaseUrl = () => {
  // Default to port 3001
  const defaultPort = 3001;
  // Check localStorage for a stored port override
  const storedPort = localStorage.getItem('usbMonitorPort') || defaultPort;
  return `http://localhost:${storedPort}`;
};

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

// Check server health function
export const checkServerHealth = async () => {
  // Try multiple port configurations in case the server moved
  const portsToTry = [3001, 3002, 3003, 3004, 3005];
  
  for (const port of portsToTry) {
    try {
      const response = await fetch(`http://localhost:${port}/health`, { 
        signal: AbortSignal.timeout(1000) // 1 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Server found on port ${port}:`, data);
        // Store the working port in localStorage
        localStorage.setItem('usbMonitorPort', port.toString());
        return port;
      }
    } catch (error) {
      console.log(`Server not responding on port ${port}`);
    }
  }
  
  // If we got here, we couldn't find the server on any port
  throw new Error('Server not found on any port');
};

// Real API calls to backend with automatic reconnection logic
export const fetchUSBDevices = async () => {
  try {
    console.log("Fetching USB devices from API...");
    
    // First check if server is available
    await checkServerHealth();
    
    // Now use the updated API base URL
    const API_BASE_URL = getApiBaseUrl();
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
    
    // Check server health first
    await checkServerHealth();
    
    // Use the current API base URL
    const API_BASE_URL = getApiBaseUrl();
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
    const API_BASE_URL = getApiBaseUrl();
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

// Improved WebSocket monitoring with auto-reconnect
export const monitorUSBPorts = async (callback) => {
  try {
    // First check server health to get the correct port
    await checkServerHealth();
    
    const API_BASE_URL = getApiBaseUrl();
    const wsBaseUrl = API_BASE_URL.replace('http://', 'ws://');
    let socket = new WebSocket(`${wsBaseUrl}/usb-events`);
    
    let reconnectAttempts = 0;
    let reconnectInterval = null;
    
    const reconnect = async () => {
      try {
        // Only retry up to 5 times
        if (reconnectAttempts >= 5) {
          console.error("Failed to reconnect after 5 attempts");
          return;
        }
        
        reconnectAttempts++;
        console.log(`Attempting to reconnect WebSocket (attempt ${reconnectAttempts})...`);
        
        // Try to find the server again
        await checkServerHealth();
        
        // Get the updated base URL
        const updatedWsBaseUrl = getApiBaseUrl().replace('http://', 'ws://');
        const newSocket = new WebSocket(`${updatedWsBaseUrl}/usb-events`);
        
        // Set up the event handlers for the new socket
        newSocket.onopen = () => {
          console.log("WebSocket reconnected successfully");
          reconnectAttempts = 0; // Reset the counter on successful connection
          if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
          }
        };
        
        newSocket.onmessage = socket.onmessage;
        newSocket.onerror = socket.onerror;
        newSocket.onclose = socket.onclose;
        
        socket = newSocket; // Use let instead of const for socket
      } catch (error) {
        console.error("Error reconnecting WebSocket:", error);
      }
    };
    
    socket.onopen = () => {
      console.log("WebSocket connection established for USB monitoring");
      reconnectAttempts = 0; // Reset on successful connection
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
        
        // Call the callback with the data
        callback(data);
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };
    
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      // Don't try to reconnect here, wait for onclose
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket connection closed: ${event.reason}`);
      
      // Set up reconnection attempt
      if (!reconnectInterval) {
        reconnectInterval = setInterval(reconnect, 2000); // Try every 2 seconds
      }
    };
    
    return {
      unsubscribe: () => {
        console.log("Closing WebSocket connection");
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
        }
        socket.close();
      }
    };
  } catch (error) {
    console.error("Error setting up WebSocket connection:", error);
    throw new Error("Failed to establish WebSocket connection for USB monitoring");
  }
};
