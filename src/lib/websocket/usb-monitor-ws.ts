import { getApiBaseUrl, checkServerHealth } from '../config/api-config';

export const monitorUSBPorts = async (callback: (data: any) => void) => {
  try {
    await checkServerHealth();
    
    const API_BASE_URL = getApiBaseUrl();
    const wsBaseUrl = API_BASE_URL.replace('http://', 'ws://');
    let socket = new WebSocket(`${wsBaseUrl}/usb-events`);
    
    let reconnectAttempts = 0;
    let reconnectInterval: NodeJS.Timeout | null = null;
    
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
      reconnectAttempts = 0;
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket data:", data);
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
      if (!reconnectInterval) {
        reconnectInterval = setInterval(reconnect, 2000);
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
