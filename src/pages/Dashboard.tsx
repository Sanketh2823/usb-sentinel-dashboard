
import { useState } from "react";
import { Shield, List, Plus, Database, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UsbDevice {
  vendor_id: string;
  product_id: string;
  whitelisted: boolean;
}

const Dashboard = () => {
  // Mock data for demonstration
  const [devices, setDevices] = useState<UsbDevice[]>([
    { vendor_id: "0x1234", product_id: "0x5678", whitelisted: true },
    { vendor_id: "0x9ABC", product_id: "0xDEF0", whitelisted: false },
  ]);
  
  const [logs] = useState<string>("Sample log entry 1\nSample log entry 2\nSample log entry 3");
  const { toast } = useToast();

  const handleDeviceAction = (device: UsbDevice, action: 'whitelist' | 'block') => {
    // Update UI state locally
    const updatedDevices = devices.map(d => 
      d.vendor_id === device.vendor_id && d.product_id === device.product_id
        ? { ...d, whitelisted: action === 'whitelist' }
        : d
    );
    setDevices(updatedDevices);

    // Show toast notification
    toast({
      title: action === 'whitelist' ? "Device Whitelisted" : "Device Blocked",
      description: `Device ${device.vendor_id}:${device.product_id} has been ${action === 'whitelist' ? 'added to whitelist' : 'blocked'}.`,
    });
  };

  const stats = [
    {
      title: "Total USB Events",
      value: devices.length.toString(),
      icon: Database,
      change: "+12.3%",
      changeType: "positive",
    },
    {
      title: "Blocked Devices",
      value: devices.filter(d => !d.whitelisted).length.toString(),
      icon: Shield,
      change: "-5.4%",
      changeType: "negative",
    },
    {
      title: "Whitelisted Devices",
      value: devices.filter(d => d.whitelisted).length.toString(),
      icon: List,
      change: "+3.2%",
      changeType: "positive",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <button
          onClick={() => toast({ title: "Refreshed", description: "Dashboard data has been refreshed." })}
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCcw className="w-5 h-5 mr-2" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary/20 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <stat.icon className="w-8 h-8 text-primary" />
              <span
                className={`text-sm font-medium ${
                  stat.changeType === "positive" ? "text-success" : "text-destructive"
                }`}
              >
                {stat.change}
              </span>
            </div>
            <p className="mt-4 text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-600">{stat.title}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Connected Devices</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="table-cell">Vendor ID</th>
                  <th className="table-cell">Product ID</th>
                  <th className="table-cell">Status</th>
                  <th className="table-cell">Action</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={`${device.vendor_id}-${device.product_id}`} className="border-b">
                    <td className="table-cell">{device.vendor_id}</td>
                    <td className="table-cell">{device.product_id}</td>
                    <td className={`table-cell ${device.whitelisted ? 'status-passed' : 'status-blocked'}`}>
                      {device.whitelisted ? 'Whitelisted' : 'Blocked'}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => handleDeviceAction(device, device.whitelisted ? 'block' : 'whitelist')}
                        className={`px-3 py-1 rounded text-sm ${
                          device.whitelisted
                            ? 'bg-destructive text-white'
                            : 'bg-success text-white'
                        }`}
                      >
                        {device.whitelisted ? 'Block' : 'Whitelist'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Logs</h2>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-auto max-h-[400px] whitespace-pre-wrap">
            {logs}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

