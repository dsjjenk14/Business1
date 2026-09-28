import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/nav/AppHeader';
import { TabBar } from '@/components/nav/TabBar';
import { useTheme } from '@/theme';

/** The main tabs: Home, Pins, Tonight, Circles. (Messages is at the top.) */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ header: () => <AppHeader />, sceneStyle: { backgroundColor: t.colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="pins" options={{ title: 'Pins' }} />
      <Tabs.Screen name="tonight" options={{ title: 'Tonight' }} />
      <Tabs.Screen name="circles" options={{ title: 'Circles' }} />
    </Tabs>
  );
}
