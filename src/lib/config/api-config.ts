
// API configuration and URL management
export const getApiBaseUrl = () => {
  const defaultPort = 3001;
  const storedPort = localStorage.getItem('usbMonitorPort') || defaultPort;
  return `http://localhost:${storedPort}`;
};

export const checkServerHealth = async () => {
  const portsToTry = [3001, 3002, 3003, 3004, 3005];
  
  for (const port of portsToTry) {
    try {
      const response = await fetch(`http://localhost:${port}/health`, { 
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Server found on port ${port}:`, data);
        localStorage.setItem('usbMonitorPort', port.toString());
        return port;
      }
    } catch (error) {
      console.log(`Server not responding on port ${port}`);
    }
  }
  
  throw new Error('Server not found on any port');
};
