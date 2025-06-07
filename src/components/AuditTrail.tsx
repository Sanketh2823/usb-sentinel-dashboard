
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Shield, ShieldCheck, ShieldX, FileText, UserCheck, UserX, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface AuditLogEntry {
  id: number;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  targetType: 'device' | 'user' | 'system' | 'policy';
  targetId?: string;
  targetName?: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  outcome: 'success' | 'failure' | 'warning';
}

const AuditTrail = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const response = await fetch('http://localhost:3001/api/audit-logs');
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  useEffect(() => {
    if (auditData?.logs) {
      setAuditLogs(auditData.logs);
    }
  }, [auditData]);

  useEffect(() => {
    let filtered = auditLogs;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Action filter
    if (actionFilter !== 'all') {
      filtered = filtered.filter(log => log.action.toLowerCase().includes(actionFilter.toLowerCase()));
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(log => log.severity === severityFilter);
    }

    setFilteredLogs(filtered);
  }, [auditLogs, searchTerm, actionFilter, severityFilter]);

  const getActionIcon = (action: string) => {
    if (action.includes('login') || action.includes('auth')) return UserCheck;
    if (action.includes('logout')) return UserX;
    if (action.includes('whitelist') || action.includes('approve')) return ShieldCheck;
    if (action.includes('block') || action.includes('deny')) return ShieldX;
    if (action.includes('policy') || action.includes('config')) return Shield;
    return FileText;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'success': return 'default';
      case 'failure': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'outline';
    }
  };

  const downloadAuditReport = async () => {
    try {
      const csvHeader = 'Timestamp,User ID,User Name,Action,Target Type,Target Name,Details,IP Address,Severity,Outcome\n';
      const csvContent = filteredLogs.map(log => 
        `"${new Date(log.timestamp).toLocaleString()}","${log.userId}","${log.userName}","${log.action}","${log.targetType}","${log.targetName || ''}","${log.details}","${log.ipAddress}","${log.severity}","${log.outcome}"`
      ).join('\n');
      
      const csv = csvHeader + csvContent;
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Audit trail report downloaded successfully');
    } catch (error) {
      toast.error('Failed to download audit trail report');
      console.error('Audit download error:', error);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32">Loading audit trail...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Actions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditLogs.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Actions</CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {auditLogs.filter(log => log.outcome === 'failure').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {auditLogs.filter(log => log.severity === 'critical').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <User className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {new Set(auditLogs.map(log => log.userId)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>User Activity Audit Trail</CardTitle>
              <CardDescription>
                Comprehensive log of all user actions and system changes
              </CardDescription>
            </div>
            <Button onClick={downloadAuditReport} variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user, action, or details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="login">Login Events</SelectItem>
                <SelectItem value="whitelist">Whitelist Changes</SelectItem>
                <SelectItem value="block">Blocking Actions</SelectItem>
                <SelectItem value="policy">Policy Changes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No audit logs match the current filters
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const ActionIcon = getActionIcon(log.action);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4" />
                            <div>
                              <div className="font-medium">{log.userName}</div>
                              <div className="text-sm text-muted-foreground">{log.userId}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <ActionIcon className="h-4 w-4" />
                            <span>{log.action}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <Badge variant="outline">{log.targetType}</Badge>
                            {log.targetName && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {log.targetName}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={log.details}>
                          {log.details}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getSeverityColor(log.severity)}>
                            {log.severity.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getOutcomeColor(log.outcome)}>
                            {log.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.ipAddress}
                        </TableCell>
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
  );
};

export default AuditTrail;
