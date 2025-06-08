
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SettingsTab = () => {
  return (
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
  );
};

export default SettingsTab;
