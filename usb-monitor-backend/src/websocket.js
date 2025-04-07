
const WebSocket = require('ws');
const { readDataFile, whitelistPath, blockedAttemptsPath, logsPath, allowedClassesPath } = require('./config');

// Setup WebSocket handling
const setupWebSocket = (server) => {
  // Setup WebSocket server
  const wss = new WebSocket.Server({ server });
  
  // WebSocket connection handling
  wss.on('connection', (ws) => {
    console.log('Client connected');
    
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
    
    ws.on('error', console.error);
    
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  
  return wss;
};

module.exports = setupWebSocket;
