
const express = require('express');
const { readDataFile, writeDataFile } = require('../config');
const { addAuditLog } = require('./audit');

const router = express.Router();

// Data file paths
const quarantinePath = './data/quarantine.json';

// Helper function to determine risk level
const determineRiskLevel = (device) => {
  // High risk: Unknown manufacturers, suspicious device classes
  if (!device.manufacturer || device.manufacturer.toLowerCase().includes('unknown') ||
      device.deviceClass === 'FF' || device.vendorId === '0000') {
    return 'high';
  }
  
  // Medium risk: Storage devices from unknown sources
  if (device.deviceClass && device.deviceClass.toLowerCase().includes('storage') &&
      !device.manufacturer.toLowerCase().includes('sandisk') &&
      !device.manufacturer.toLowerCase().includes('kingston') &&
      !device.manufacturer.toLowerCase().includes('samsung')) {
    return 'medium';
  }
  
  return 'low';
};

// Add device to quarantine
const addToQuarantine = async (device, reason = 'Unknown device detected') => {
  try {
    const quarantinedDevices = readDataFile(quarantinePath);
    
    const quarantineEntry = {
      id: Date.now(),
      vendorId: device.vendorId,
      productId: device.productId,
      manufacturer: device.manufacturer || 'Unknown',
      description: device.description || 'Unknown Device',
      deviceClass: device.deviceClass || 'Unknown',
      connectionType: device.connectionType || 'USB',
      quarantineDate: new Date().toISOString(),
      quarantineReason: reason,
      riskLevel: determineRiskLevel(device),
      status: 'quarantined'
    };
    
    quarantinedDevices.unshift(quarantineEntry);
    writeDataFile(quarantinePath, quarantinedDevices);
    
    // Add audit log
    await addAuditLog({
      userId: 'system',
      userName: 'USB Monitor System',
      action: 'Device Quarantined',
      targetType: 'device',
      targetId: `${device.vendorId}:${device.productId}`,
      targetName: `${device.manufacturer} ${device.description}`,
      details: `Device automatically quarantined: ${reason}`,
      ipAddress: '127.0.0.1',
      userAgent: 'USB Monitor Backend',
      severity: quarantineEntry.riskLevel === 'high' ? 'high' : 'medium',
      outcome: 'success'
    });
    
    return quarantineEntry;
  } catch (error) {
    console.error('Error adding device to quarantine:', error);
    throw error;
  }
};

// Get all quarantined devices
router.get('/', (req, res) => {
  try {
    const quarantinedDevices = readDataFile(quarantinePath);
    res.json({ quarantinedDevices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve quarantined device
router.post('/approve', async (req, res) => {
  try {
    const { deviceId, adminAction, adminUser, timestamp } = req.body;
    let quarantinedDevices = readDataFile(quarantinePath);
    
    const deviceIndex = quarantinedDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found in quarantine' });
    }
    
    const device = quarantinedDevices[deviceIndex];
    quarantinedDevices[deviceIndex].status = 'approved';
    quarantinedDevices[deviceIndex].approvedDate = timestamp;
    quarantinedDevices[deviceIndex].approvedBy = adminUser;
    
    writeDataFile(quarantinePath, quarantinedDevices);
    
    // Add audit log
    await addAuditLog({
      userId: adminUser,
      userName: adminUser,
      action: 'Device Approved from Quarantine',
      targetType: 'device',
      targetId: `${device.vendorId}:${device.productId}`,
      targetName: `${device.manufacturer} ${device.description}`,
      details: `Device approved and moved to whitelist from quarantine`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent') || 'Unknown',
      severity: 'medium',
      outcome: 'success'
    });
    
    res.json({ success: true, message: 'Device approved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block quarantined device permanently
router.post('/block', async (req, res) => {
  try {
    const { deviceId, adminAction, adminUser, timestamp } = req.body;
    let quarantinedDevices = readDataFile(quarantinePath);
    
    const deviceIndex = quarantinedDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found in quarantine' });
    }
    
    const device = quarantinedDevices[deviceIndex];
    quarantinedDevices[deviceIndex].status = 'blocked';
    quarantinedDevices[deviceIndex].blockedDate = timestamp;
    quarantinedDevices[deviceIndex].blockedBy = adminUser;
    
    writeDataFile(quarantinePath, quarantinedDevices);
    
    // Add audit log
    await addAuditLog({
      userId: adminUser,
      userName: adminUser,
      action: 'Device Permanently Blocked',
      targetType: 'device',
      targetId: `${device.vendorId}:${device.productId}`,
      targetName: `${device.manufacturer} ${device.description}`,
      details: `Device permanently blocked from quarantine`,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent') || 'Unknown',
      severity: 'high',
      outcome: 'success'
    });
    
    res.json({ success: true, message: 'Device blocked permanently' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  addToQuarantine
};
