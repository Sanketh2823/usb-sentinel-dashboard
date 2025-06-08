
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Navigation from '@/components/Navigation';
import { fetchUSBDevices } from '@/lib/usb-service';
import WhitelistManager from '@/components/WhitelistManager';
import DashboardHeader from '@/components/DashboardHeader';
import StatisticsCards from '@/components/StatisticsCards';
import RecentActivity from '@/components/RecentActivity';
import ReportsTab from '@/components/ReportsTab';
import SettingsTab from '@/components/SettingsTab';

const Dashboard = () => {
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading dashboard data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-6 space-y-6">
        <DashboardHeader />

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <StatisticsCards 
              logs={logs}
              blockedAttempts={blockedAttempts}
              whitelistedDevices={whitelistedDevices}
            />
            <RecentActivity logs={logs} />
          </TabsContent>

          <TabsContent value="whitelist" className="space-y-6">
            <WhitelistManager />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
