
export * from './config/api-config';
export * from './utils/device-utils';
export * from './websocket/usb-monitor-ws';
export * from './operations/device-operations';

// Additional USB device management functions
export const addDeviceToWhitelist = async (device: any) => {
  const response = await fetch('http://localhost:3001/api/whitelist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device)
  });
  
  if (!response.ok) {
    throw new Error('Failed to add device to whitelist');
  }
  
  return response.json();
};

export const removeDeviceFromWhitelist = async (deviceId: number) => {
  const response = await fetch(`http://localhost:3001/api/whitelist/${deviceId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error('Failed to remove device from whitelist');
  }
  
  return response.json();
};

export const fetchUSBDevices = async () => {
  const response = await fetch('http://localhost:3001/api/usb-devices');
  
  if (!response.ok) {
    throw new Error('Failed to fetch USB devices');
  }
  
  return response.json();
};
