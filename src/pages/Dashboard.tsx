
import Navigation from '@/components/Navigation';
import DashboardHeader from '@/components/DashboardHeader';
import DashboardLoading from '@/components/DashboardLoading';
import DashboardTabs from '@/components/DashboardTabs';
import { useUSBData } from '@/hooks/useUSBData';

const Dashboard = () => {
  const { logs, whitelistedDevices, blockedAttempts, isLoading } = useUSBData();

  if (isLoading) {
    return <DashboardLoading />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-6 space-y-6">
        <DashboardHeader />
        <DashboardTabs 
          logs={logs}
          blockedAttempts={blockedAttempts}
          whitelistedDevices={whitelistedDevices}
        />
      </div>
    </div>
  );
};

export default Dashboard;
