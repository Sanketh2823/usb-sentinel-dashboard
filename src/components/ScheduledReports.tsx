
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Download, Mail, Clock, Trash2, Plus } from 'lucide-react';

interface ScheduledReport {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'pdf' | 'csv' | 'json';
  recipients: string[];
  lastRun: Date;
  nextRun: Date;
  status: 'active' | 'paused';
}

const ScheduledReports = () => {
  const [reports, setReports] = useState<ScheduledReport[]>([
    {
      id: '1',
      name: 'Daily Security Summary',
      frequency: 'daily',
      format: 'pdf',
      recipients: ['admin@company.com'],
      lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000),
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    },
    {
      id: '2',
      name: 'Weekly Device Analysis',
      frequency: 'weekly',
      format: 'csv',
      recipients: ['security@company.com', 'it@company.com'],
      lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active'
    }
  ]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newReport, setNewReport] = useState({
    name: '',
    frequency: 'daily' as const,
    format: 'pdf' as const,
    recipients: ''
  });

  const handleAddReport = () => {
    if (!newReport.name || !newReport.recipients) return;

    const recipients = newReport.recipients.split(',').map(email => email.trim());
    const now = new Date();
    const nextRun = new Date(now);
    
    if (newReport.frequency === 'daily') {
      nextRun.setDate(now.getDate() + 1);
    } else if (newReport.frequency === 'weekly') {
      nextRun.setDate(now.getDate() + 7);
    } else {
      nextRun.setMonth(now.getMonth() + 1);
    }

    const report: ScheduledReport = {
      id: Date.now().toString(),
      name: newReport.name,
      frequency: newReport.frequency,
      format: newReport.format,
      recipients,
      lastRun: now,
      nextRun,
      status: 'active'
    };

    setReports([...reports, report]);
    setNewReport({ name: '', frequency: 'daily', format: 'pdf', recipients: '' });
    setShowAddForm(false);
  };

  const deleteReport = (id: string) => {
    setReports(reports.filter(r => r.id !== id));
  };

  const toggleStatus = (id: string) => {
    setReports(reports.map(r => 
      r.id === id ? { ...r, status: r.status === 'active' ? 'paused' : 'active' } : r
    ));
  };

  const generateReport = (report: ScheduledReport) => {
    // Simulate report generation
    console.log(`Generating ${report.format.toUpperCase()} report: ${report.name}`);
    // In a real implementation, this would trigger the backend to generate and send the report
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scheduled Reports</h2>
          <p className="text-muted-foreground">Automate your security reporting</p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Report
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Scheduled Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Report Name</Label>
                <Input
                  id="name"
                  value={newReport.name}
                  onChange={(e) => setNewReport({ ...newReport, name: e.target.value })}
                  placeholder="e.g., Daily Security Report"
                />
              </div>
              <div>
                <Label htmlFor="frequency">Frequency</Label>
                <Select value={newReport.frequency} onValueChange={(value: any) => setNewReport({ ...newReport, frequency: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="format">Format</Label>
                <Select value={newReport.format} onValueChange={(value: any) => setNewReport({ ...newReport, format: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="recipients">Recipients (comma-separated)</Label>
                <Input
                  id="recipients"
                  value={newReport.recipients}
                  onChange={(e) => setNewReport({ ...newReport, recipients: e.target.value })}
                  placeholder="admin@company.com, security@company.com"
                />
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleAddReport}>Create Report</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active Reports</CardTitle>
          <CardDescription>Manage your automated security reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {report.frequency}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{report.format.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      {report.recipients.map((email, index) => (
                        <div key={index} className="text-sm text-muted-foreground">
                          {email}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {report.lastRun.toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {report.nextRun.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={report.status === 'active' ? 'default' : 'secondary'}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateReport(report)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatus(report.id)}
                      >
                        {report.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteReport(report.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScheduledReports;
