import { View } from 'react-native';

import { PhotoChecks } from '@/components/admin/PhotoChecks';
import { BackHeader } from '@/components/nav/AppHeader';
import { EmptyState, LoadingList, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/** Review photos: the photo check queue, for admins and photo reviewers. */
export default function Review() {
  const t = useTheme();
  const { profile } = useAuth();
  const allowed = profile?.role === 'admin' || !!profile?.photo_reviewer;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title="Review photos" />
      <Screen>{!profile ? <LoadingList rows={2} /> : allowed ? <PhotoChecks /> : <EmptyState glyph="lock" title="For photo reviewers" />}</Screen>
    </View>
  );
}
