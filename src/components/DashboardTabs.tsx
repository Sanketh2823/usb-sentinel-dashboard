
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WhitelistManager from '@/components/WhitelistManager';
import StatisticsCards from '@/components/StatisticsCards';
import RecentActivity from '@/components/RecentActivity';
import ReportsTab from '@/components/ReportsTab';
import SettingsTab from '@/components/SettingsTab';

interface DashboardTabsProps {
  logs: any[];
  blockedAttempts: any[];
  whitelistedDevices: any[];
}

const DashboardTabs = ({ logs, blockedAttempts, whitelistedDevices }: DashboardTabsProps) => {
  return (
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
  );
};

export default DashboardTabs;
