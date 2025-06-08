
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DashboardHeader = () => {
  return (
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
  );
};

export default DashboardHeader;
