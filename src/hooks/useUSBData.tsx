
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUSBDevices } from '@/lib/usb-service';

export const useUSBData = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [whitelistedDevices, setWhitelistedDevices] = useState<any[]>([]);
  const [blockedAttempts, setBlockedAttempts] = useState<any[]>([]);

  const { data: usbData, isLoading } = useQuery({
    queryKey: ['usb-devices'],
    queryFn: fetchUSBDevices,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (usbData) {
      setLogs(usbData.logs || []);
      setWhitelistedDevices(usbData.whitelistedDevices || []);
      setBlockedAttempts(usbData.blockedAttempts || []);
    }
  }, [usbData]);

  return {
    logs,
    whitelistedDevices,
    blockedAttempts,
    isLoading
  };
};
