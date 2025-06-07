const express = require('express');
const { readDataFile, writeDataFile } = require('../config');

const router = express.Router();

// Data file path
const auditPath = './data/audit.json';

// Add audit log entry
const addAuditLog = async (logData) => {
  try {
    const auditLogs = readDataFile(auditPath);
    
    const auditEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      userId: logData.userId || 'unknown',
      userName: logData.userName || 'Unknown User',
      action: logData.action,
      targetType: logData.targetType || 'system',
      targetId: logData.targetId || null,
      targetName: logData.targetName || null,
      details: logData.details,
      ipAddress: logData.ipAddress || '127.0.0.1',
      userAgent: logData.userAgent || 'Unknown',
      severity: logData.severity || 'low',
      outcome: logData.outcome || 'success'
    };
    
    auditLogs.unshift(auditEntry);
    
    // Keep only last 10000 entries to prevent file from growing too large
    if (auditLogs.length > 10000) {
      auditLogs.splice(10000);
    }
    
    writeDataFile(auditPath, auditLogs);
    return auditEntry;
  } catch (error) {
    console.error('Error adding audit log:', error);
    throw error;
  }
};

// Get all audit logs
router.get('/', (req, res) => {
  try {
    const auditLogs = readDataFile(auditPath);
    res.json({ logs: auditLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs with filtering
router.get('/filtered', (req, res) => {
  try {
    const { userId, action, severity, startDate, endDate, limit = 1000 } = req.query;
    let auditLogs = readDataFile(auditPath);
    
    // Apply filters
    if (userId) {
      auditLogs = auditLogs.filter(log => log.userId === userId);
    }
    
    if (action) {
      auditLogs = auditLogs.filter(log => 
        log.action.toLowerCase().includes(action.toLowerCase())
      );
    }
    
    if (severity) {
      auditLogs = auditLogs.filter(log => log.severity === severity);
    }
    
    if (startDate) {
      auditLogs = auditLogs.filter(log => 
        new Date(log.timestamp) >= new Date(startDate)
      );
    }
    
    if (endDate) {
      auditLogs = auditLogs.filter(log => 
        new Date(log.timestamp) <= new Date(endDate)
      );
    }
    
    // Limit results
    auditLogs = auditLogs.slice(0, parseInt(limit));
    
    res.json({ logs: auditLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  addAuditLog
};
