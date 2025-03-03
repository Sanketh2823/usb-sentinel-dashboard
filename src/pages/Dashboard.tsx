
import { useState, useEffect } from "react";
import { Shield, List, Plus, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { fetchUSBDevices, monitorUSBPorts, addDeviceToWhitelist } from "@/lib/usb-service";

// Import the new components
import StatusCard from "@/components/dashboard/StatusCard";
import WhitelistedDevicesTable from "@/components/dashboard/WhitelistedDevicesTable";
import BlockedAttemptsTable from "@/components/dashboard/BlockedAttemptsTable";
import EventsLogTable from "@/components/dashboard/EventsLogTable";
import QuickActions from "@/components/dashboard/QuickActions";
import AddDeviceModal from "@/components/dashboard/AddDeviceModal";

const Dashboard = () => {
  const { toast } = useToast();
  const [showWhitelistDevices, setShowWhitelistDevices] = useState(false);
  const [showBlockedAttempts, setShowBlockedAttempts] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState("all");
  const [usernameFilter, setUsernameFilter] = useState("");
  
  const [whitelistedDevices, setWhitelistedDevices] = useState([]);
  const [blockedAttempts, setBlockedAttempts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchUSBDevices();
        setWhitelistedDevices(data.whitelistedDevices || []);
        setBlockedAttempts(data.blockedAttempts || []);
        setLogs(data.logs || []);
        setLastUpdated(new Date());
      } catch (error) {
        console.error("Error fetching USB devices:", error);
        toast({
          title: "Error",
          description: "Failed to fetch USB devices data",
          variant: "destructive",
        });
      }
    };
    
    fetchData();
  }, [toast]);

  useEffect(() => {
    let monitoringSubscription;
    
    const startMonitoring = async () => {
      try {
        setIsMonitoring(true);
        monitoringSubscription = await monitorUSBPorts((newData) => {
          if (newData.newLog) {
            setLogs(prev => [newData.newLog, ...prev]);
          }
          
          if (newData.newBlockedAttempt) {
            setBlockedAttempts(prev => [newData.newBlockedAttempt, ...prev]);
          }
          
          if (newData.whitelistUpdate) {
            setWhitelistedDevices(newData.whitelistUpdate);
          }
          
          setLastUpdated(new Date());
          
          if (newData.newBlockedAttempt) {
            toast({
              title: "USB Access Blocked",
              description: `${newData.newBlockedAttempt.manufacturer || "Unknown device"} was blocked from accessing the system`,
              variant: "destructive",
            });
          }
        });
      } catch (error) {
        console.error("Error monitoring USB ports:", error);
        setIsMonitoring(false);
        toast({
          title: "Monitoring Error",
          description: "Failed to start USB port monitoring",
          variant: "destructive",
        });
      }
    };
    
    startMonitoring();
    
    return () => {
      if (monitoringSubscription) {
        monitoringSubscription.unsubscribe();
      }
      setIsMonitoring(false);
    };
  }, [toast]);

  const handleAddDevice = async (newDevice) => {
    try {
      await addDeviceToWhitelist(newDevice);
      
      setWhitelistedDevices(prev => [
        ...prev, 
        {
          id: Date.now(),
          ...newDevice,
          status: "allowed"
        }
      ]);
      
      toast({
        title: "Success!",
        description: "Device added to whitelist successfully",
        variant: "default",
      });
      
      setShowAddDeviceModal(false);
    } catch (error) {
      console.error("Error adding device to whitelist:", error);
      toast({
        title: "Error",
        description: "Failed to add device to whitelist",
        variant: "destructive",
      });
    }
  };

  const handleAddToWhitelist = async (device) => {
    try {
      await addDeviceToWhitelist(device);
      
      setWhitelistedDevices(prev => [
        ...prev, 
        {
          ...device,
          id: Date.now(),
          status: "allowed"
        }
      ]);
      
      setBlockedAttempts(prev => 
        prev.filter(item => 
          !(item.productId === device.productId && 
            item.vendorId === device.vendorId)
        )
      );
      
      toast({
        title: "Success!",
        description: "Device added to whitelist successfully",
        variant: "default",
      });
    } catch (error) {
      console.error("Error adding device to whitelist:", error);
      toast({
        title: "Error",
        description: "Failed to add device to whitelist",
        variant: "destructive",
      });
    }
  };

  const stats = [
    {
      title: "Total USB Events",
      value: logs.length.toString(),
      icon: Database,
      change: logs.length > 0 ? `Last: ${new Date(logs[0]?.date).toLocaleTimeString()}` : "No events",
      changeType: "neutral",
    },
    {
      title: "Blocked Attempts",
      value: blockedAttempts.length.toString(),
      icon: Shield,
      change: blockedAttempts.length > 0 ? `Last: ${new Date(blockedAttempts[0]?.date).toLocaleTimeString()}` : "No blocks",
      changeType: "negative",
    },
    {
      title: "Whitelisted Devices",
      value: whitelistedDevices.length.toString(),
      icon: List,
      change: `${whitelistedDevices.length} devices`,
      changeType: "positive",
    },
  ];

  const showLogPanel = () => {
    setShowLogs(true);
    setShowWhitelistDevices(false);
    setShowBlockedAttempts(false);
  };

  const showWhitelistPanel = () => {
    setShowWhitelistDevices(true);
    setShowLogs(false);
    setShowBlockedAttempts(false);
  };

  const showBlockedPanel = () => {
    setShowBlockedAttempts(true);
    setShowWhitelistDevices(false);
    setShowLogs(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isMonitoring ? 
              "USB Ports Monitoring Active" : 
              "Monitoring Inactive"} | Last Updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <Button 
          onClick={() => setShowAddDeviceModal(true)}
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Device
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <StatusCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            change={stat.change}
            changeType={stat.changeType}
            onClick={() => {
              if (stat.title === "Whitelisted Devices") {
                showWhitelistPanel();
              } else if (stat.title === "Blocked Attempts") {
                showBlockedPanel();
              } else if (stat.title === "Total USB Events") {
                showLogPanel();
              }
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
          
          {showWhitelistDevices && (
            <WhitelistedDevicesTable devices={whitelistedDevices} />
          )}
          
          {showBlockedAttempts && (
            <BlockedAttemptsTable 
              devices={blockedAttempts} 
              onAddToWhitelist={handleAddToWhitelist}
            />
          )}
          
          {showLogs && (
            <EventsLogTable 
              logs={logs}
              statusFilter={statusFilter}
              usernameFilter={usernameFilter}
              onStatusFilterChange={setStatusFilter}
              onUsernameFilterChange={setUsernameFilter}
            />
          )}
          
          {!showWhitelistDevices && !showBlockedAttempts && !showLogs && (
            <p className="text-gray-500 italic">Click on one of the stats cards above to view details</p>
          )}
        </div>
        
        <QuickActions 
          onViewLogs={showLogPanel}
          onViewWhitelist={showWhitelistPanel}
          isMonitoring={isMonitoring}
        />
      </div>

      <AddDeviceModal
        open={showAddDeviceModal}
        onOpenChange={setShowAddDeviceModal}
        onAddDevice={handleAddDevice}
      />
    </div>
  );
};

export default Dashboard;
