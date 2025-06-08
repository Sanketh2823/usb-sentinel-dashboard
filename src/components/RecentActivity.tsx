
import { Network, Wifi, Usb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface RecentActivityProps {
  logs: any[];
}

const RecentActivity = ({ logs }: RecentActivityProps) => {
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

  return (
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
  );
};

export default RecentActivity;
