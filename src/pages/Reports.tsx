import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, FileSpreadsheet, Shield, Clock, User, Network, Usb } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

interface LogEntry {
  id: number;
  action: string;
  device: string;
  deviceClass: string;
  connectionType?: string;
  status: string;
  date: string;
  username: string;
}

const Reports = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Fetch logs data
  const { data: usbData, isLoading } = useQuery({
    queryKey: ['usb-devices'],
    queryFn: async () => {
      const response = await fetch('http://localhost:3001/api/usb-devices');
      if (!response.ok) {
        throw new Error('Failed to fetch USB data');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  useEffect(() => {
    if (usbData?.logs) {
      // Add connection type based on device class or action
      const enhancedLogs = usbData.logs.map((log: LogEntry) => ({
        ...log,
        connectionType: determineConnectionType(log)
      }));
      setLogs(enhancedLogs);
    }
  }, [usbData]);

  const determineConnectionType = (log: LogEntry) => {
    // Determine connection type based on device class or device description
    if (log.deviceClass?.toLowerCase().includes('network') || 
        log.device?.toLowerCase().includes('ethernet') ||
        log.device?.toLowerCase().includes('wifi') ||
        log.device?.toLowerCase().includes('bluetooth')) {
      return 'Network';
    }
    return 'USB';
  };

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
    return connectionType === 'Network' ? Network : Usb;
  };

  const downloadPDF = async () => {
    try {
      // Create PDF content
      const pdfContent = `
USB Monitor Access Control Report
Generated: ${new Date().toLocaleString()}

SECURITY LOG ENTRIES:
${logs.map(log => `
Date: ${new Date(log.date).toLocaleString()}
Action: ${log.action}
Device: ${log.device}
Class: ${log.deviceClass}
Connection Type: ${log.connectionType || 'USB'}
Status: ${log.status}
User: ${log.username}
---
`).join('')}

Total Entries: ${logs.length}
      `;

      // Create blob and download
      const blob = new Blob([pdfContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usb-monitor-report-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Report downloaded successfully');
    } catch (error) {
      toast.error('Failed to download PDF report');
      console.error('PDF download error:', error);
    }
  };

  const downloadCSV = () => {
    try {
      // Create CSV content
      const csvHeader = 'Date,Action,Device,Device Class,Connection Type,Status,Username\n';
      const csvContent = logs.map(log => 
        `"${new Date(log.date).toLocaleString()}","${log.action}","${log.device}","${log.deviceClass}","${log.connectionType || 'USB'}","${log.status}","${log.username}"`
      ).join('\n');
      
      const csv = csvHeader + csvContent;
      
      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usb-monitor-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('CSV report downloaded successfully');
    } catch (error) {
      toast.error('Failed to download CSV report');
      console.error('CSV download error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading reports...</div>
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
              <h1 className="text-3xl font-bold">Access Control Reports</h1>
              <p className="text-muted-foreground">View and download USB device activity logs</p>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button onClick={downloadPDF} variant="outline" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Download PDF</span>
            </Button>
            <Button onClick={downloadCSV} variant="outline" className="flex items-center space-x-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Download CSV</span>
            </Button>
          </div>
        </div>

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
                {logs.filter(log => log.status.toLowerCase() === 'blocked').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Allowed Devices</CardTitle>
              <Shield className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {logs.filter(log => log.status.toLowerCase() === 'allowed').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(logs.map(log => log.username)).size}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Security Activity Log</CardTitle>
            <CardDescription>
              Complete history of USB device access attempts and actions
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
                      <TableHead>Connection Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
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
                            <div className="flex items-center space-x-2">
                              <ConnectionIcon className="h-4 w-4" />
                              <span>{log.connectionType || 'USB'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(log.status)}>
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.username}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
