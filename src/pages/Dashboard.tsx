
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, List, Plus, Database, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const { toast } = useToast();
  const [showWhitelistDevices, setShowWhitelistDevices] = useState(false);
  const [showBlockedAttempts, setShowBlockedAttempts] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  
  // Mock data for devices, logs, and blocked attempts
  const whitelistedDevices = [
    { id: 1, productId: "0x1234", vendorId: "0x5678", manufacturer: "Kingston", username: "john.doe", status: "allowed" },
    { id: 2, productId: "0x4321", vendorId: "0x8765", manufacturer: "SanDisk", username: "jane.smith", status: "allowed" },
    { id: 3, productId: "0xabcd", vendorId: "0xefgh", manufacturer: "Seagate", username: "admin", status: "allowed" },
  ];
  
  const blockedAttempts = [
    { id: 1, productId: "0x9876", vendorId: "0x5432", manufacturer: "Unknown Device", username: "guest", status: "blocked", date: "2025-03-03", time: "14:32:45" },
    { id: 2, productId: "0xfedc", vendorId: "0xba98", manufacturer: "Generic USB", username: "test.user", status: "blocked", date: "2025-03-02", time: "09:15:22" },
  ];
  
  const logs = [
    { id: 1, productId: "0x1234", vendorId: "0x5678", manufacturer: "Kingston", username: "john.doe", status: "allowed", date: "2025-03-03", time: "15:42:18", action: "connected" },
    { id: 2, productId: "0x9876", vendorId: "0x5432", manufacturer: "Unknown Device", username: "guest", status: "blocked", date: "2025-03-03", time: "14:32:45", action: "blocked" },
    { id: 3, productId: "0x4321", vendorId: "0x8765", manufacturer: "SanDisk", username: "jane.smith", status: "allowed", date: "2025-03-03", time: "12:10:33", action: "disconnected" },
    { id: 4, productId: "0xfedc", vendorId: "0xba98", manufacturer: "Generic USB", username: "test.user", status: "blocked", date: "2025-03-02", time: "09:15:22", action: "blocked" },
    { id: 5, productId: "0xabcd", vendorId: "0xefgh", manufacturer: "Seagate", username: "admin", status: "allowed", date: "2025-03-01", time: "17:23:05", action: "connected" },
  ];

  // Form state for adding new device
  const [newDevice, setNewDevice] = useState({
    productId: "",
    vendorId: "",
    manufacturer: "",
    username: ""
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewDevice(prev => ({ ...prev, [name]: value }));
  };

  const handleAddDevice = () => {
    // In a real app, this would send data to a backend
    toast({
      title: "Success!",
      description: "Device added to whitelist successfully",
      variant: "default",
    });
    setShowAddDeviceModal(false);
    setNewDevice({
      productId: "",
      vendorId: "",
      manufacturer: "",
      username: ""
    });
  };

  const handleAddToWhitelist = (device) => {
    // In a real app, this would send data to a backend
    toast({
      title: "Success!",
      description: "Device added to whitelist successfully",
      variant: "default",
    });
  };

  const stats = [
    {
      title: "Total USB Events",
      value: logs.length.toString(),
      icon: Database,
      change: "+12.3%",
      changeType: "positive",
    },
    {
      title: "Blocked Attempts",
      value: blockedAttempts.length.toString(),
      icon: Shield,
      change: "-5.4%",
      changeType: "negative",
    },
    {
      title: "Whitelisted Devices",
      value: whitelistedDevices.length.toString(),
      icon: List,
      change: "+3.2%",
      changeType: "positive",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
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
          <div
            key={stat.title}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-primary/20 transition-all duration-200 cursor-pointer"
            onClick={() => {
              if (stat.title === "Whitelisted Devices") {
                setShowWhitelistDevices(true);
                setShowBlockedAttempts(false);
                setShowLogs(false);
              } else if (stat.title === "Blocked Attempts") {
                setShowBlockedAttempts(true);
                setShowWhitelistDevices(false);
                setShowLogs(false);
              } else if (stat.title === "Total USB Events") {
                setShowLogs(true);
                setShowWhitelistDevices(false);
                setShowBlockedAttempts(false);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <stat.icon className="w-8 h-8 text-primary" />
              <span
                className={`text-sm font-medium ${
                  stat.changeType === "positive" ? "text-green-600" : "text-red-600"
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
          <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
          {showWhitelistDevices && (
            <div>
              <h3 className="text-md font-medium mb-2">Whitelisted Devices</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whitelistedDevices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>{device.productId}</TableCell>
                        <TableCell>{device.vendorId}</TableCell>
                        <TableCell>{device.manufacturer}</TableCell>
                        <TableCell>{device.username}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check className="w-3 h-3 mr-1" />
                            {device.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {showBlockedAttempts && (
            <div>
              <h3 className="text-md font-medium mb-2">Blocked Attempts</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedAttempts.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>{device.productId}</TableCell>
                        <TableCell>{device.vendorId}</TableCell>
                        <TableCell>{device.manufacturer}</TableCell>
                        <TableCell>{device.username}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <X className="w-3 h-3 mr-1" />
                            {device.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleAddToWhitelist(device)}
                          >
                            Add to Whitelist
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {showLogs && (
            <div>
              <h3 className="text-md font-medium mb-2">All USB Events</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Vendor ID</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.date}</TableCell>
                        <TableCell>{log.time}</TableCell>
                        <TableCell>{log.productId}</TableCell>
                        <TableCell>{log.vendorId}</TableCell>
                        <TableCell>{log.manufacturer}</TableCell>
                        <TableCell>{log.username}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.status === "allowed" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {log.status === "allowed" ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                            {log.status}
                          </span>
                        </TableCell>
                        <TableCell>{log.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {!showWhitelistDevices && !showBlockedAttempts && !showLogs && (
            <p className="text-gray-500 italic">Click on one of the stats cards above to view details</p>
          )}
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-4">
            <div
              onClick={() => {
                setShowLogs(true);
                setShowWhitelistDevices(false);
                setShowBlockedAttempts(false);
              }}
              className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <Database className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">View Logs</h3>
                <p className="text-sm text-gray-600">Check USB device activity</p>
              </div>
            </div>
            <div
              onClick={() => {
                setShowWhitelistDevices(true);
                setShowLogs(false);
                setShowBlockedAttempts(false);
              }}
              className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <List className="w-6 h-6 text-primary mr-3" />
              <div>
                <h3 className="font-medium">Manage Whitelist</h3>
                <p className="text-sm text-gray-600">Add or remove USB devices</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Device Modal */}
      <Dialog open={showAddDeviceModal} onOpenChange={setShowAddDeviceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device to Whitelist</DialogTitle>
            <DialogDescription>
              Enter the details of the USB device you want to add to the whitelist.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="productId" className="text-right">
                Product ID
              </label>
              <input
                id="productId"
                name="productId"
                value={newDevice.productId}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 border rounded-md"
                placeholder="0x1234"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="vendorId" className="text-right">
                Vendor ID
              </label>
              <input
                id="vendorId"
                name="vendorId"
                value={newDevice.vendorId}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 border rounded-md"
                placeholder="0x5678"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="manufacturer" className="text-right">
                Manufacturer
              </label>
              <input
                id="manufacturer"
                name="manufacturer"
                value={newDevice.manufacturer}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 border rounded-md"
                placeholder="Kingston"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="username" className="text-right">
                Username
              </label>
              <input
                id="username"
                name="username"
                value={newDevice.username}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 border rounded-md"
                placeholder="john.doe"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDeviceModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDevice}>Add Device</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
