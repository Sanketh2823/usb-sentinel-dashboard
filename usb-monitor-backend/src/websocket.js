const WebSocket = require('ws');
const { readDataFile, whitelistPath, blockedAttemptsPath, logsPath, allowedClassesPath } = require('./config');

// Setup WebSocket handling
const setupWebSocket = (server) => {
  // Setup WebSocket server with ping/pong for keeping connections alive
  const wss = new WebSocket.Server({ 
    server,
    // Increase timeout values for more stability
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      // Below options specified as default values
      concurrencyLimit: 10,
      threshold: 1024
    }
  });
  
  // Set up interval for ping-pong to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log("Terminating inactive WebSocket connection");
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(interval);
  });
  
  // WebSocket connection handling
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    console.log('Client connected');
    
    // Handle pong responses to keep connection alive
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Send initial data to the client
    try {
      const whitelistedDevices = readDataFile(whitelistPath);
      const blockedAttempts = readDataFile(blockedAttemptsPath);
      const logs = readDataFile(logsPath);
      const allowedClasses = readDataFile(allowedClassesPath);
      
      ws.send(JSON.stringify({
        whitelistedDevices,
        blockedAttempts,
        logs,
        allowedClasses
      }));
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
    
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  
  return wss;
};

module.exports = setupWebSocket;
