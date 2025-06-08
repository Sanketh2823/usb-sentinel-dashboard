
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ReportsTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports & Analytics</CardTitle>
        <CardDescription>
          Generate and view device activity reports
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Daily Report</CardTitle>
              <CardDescription>Today's device activity summary</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Generate Daily Report</Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Weekly Report</CardTitle>
              <CardDescription>Last 7 days activity overview</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">Generate Weekly Report</Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Monthly Report</CardTitle>
              <CardDescription>Comprehensive monthly analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">Generate Monthly Report</Button>
            </CardContent>
          </Card>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Recent Reports</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Security Report - December 2024</p>
                <p className="text-sm text-muted-foreground">Generated on {new Date().toLocaleDateString()}</p>
              </div>
              <Button variant="ghost" size="sm">Download</Button>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Weekly Activity Summary</p>
                <p className="text-sm text-muted-foreground">Generated on {new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
              </div>
              <Button variant="ghost" size="sm">Download</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportsTab;
