
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Shield, User, Network, Usb, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import { fetchUSBDevices } from '@/lib/usb-service';
import WhitelistManager from '@/components/WhitelistManager';

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

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'allowed':
        return 'default';
      case 'blocked':
        return 'destructive';
      case 'whitelisted':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getConnectionIcon = (connectionType: string) => {
    switch (connectionType?.toLowerCase()) {
      case 'network':
        return Network;
      case 'wifi':
      case 'wireless':
        return Wifi;
      default:
        return Usb;
    }
  };

  const getConnectionBadgeVariant = (connectionType: string) => {
    switch (connectionType?.toLowerCase()) {
      case 'network':
        return 'default';
      case 'wifi':
      case 'wireless':
        return 'secondary';
      default:
        return 'outline';
    }
  };

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold">USB Protection Dashboard</h1>
              <p className="text-muted-foreground">Monitor and manage USB device access</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline">
              Download Report
            </Button>
          </div>
        </div>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{logs.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Blocked Devices</CardTitle>
                  <Shield className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {blockedAttempts.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Whitelisted Devices</CardTitle>
                  <Shield className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {whitelistedDevices.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Network Sources</CardTitle>
                  <Network className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {logs.filter(log => log.connectionType?.toLowerCase() === 'network').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity and Monitoring */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest USB device activity logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No activity logs available
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Connection</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>User</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.slice(0, 5).map((log) => {
                          const ConnectionIcon = getConnectionIcon(log.connectionType || 'USB');
                          return (
                            <TableRow key={log.id}>
                              <TableCell className="font-mono text-sm">
                                {new Date(log.date).toLocaleString()}
                              </TableCell>
                              <TableCell className="font-medium">
                                {log.action}
                              </TableCell>
                              <TableCell className="max-w-xs truncate" title={log.device}>
                                {log.device}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{log.deviceClass}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {log.source || 'Local'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <ConnectionIcon className="h-4 w-4" />
                                  <Badge variant={getConnectionBadgeVariant(log.connectionType || 'USB')}>
                                    {log.connectionType || 'USB'}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(log.status)}>
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{log.username || 'System'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="whitelist" className="space-y-6">
            <WhitelistManager />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dashboard Settings</CardTitle>
                <CardDescription>
                  Customize your dashboard preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>Settings content goes here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
