import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { AppText, Button, Card, GlyphTitle, useToast } from '@/components/ui';
import { groupInviteLink } from '@/features/groups/api';
import { friendlyError } from '@/lib/supabase';
import { WEB_URL } from '@/lib/webUrl';
import { useTheme } from '@/theme';

/** For the owner and co-hosts: one link that brings the whole group in. */
export function GroupInviteLink({ groupId, groupName }: { groupId: number; groupName: string }) {
  const t = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function share(fresh: boolean) {
    setBusy(true);
    try {
      const url = `${WEB_URL}/groups/link/${await groupInviteLink(groupId, fresh)}`;
      const message = `Join ${groupName} on I'm In: ${url}`;
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        toast(fresh ? 'New link copied. The old one no longer works.' : 'Invite link copied');
      } else {
        if (fresh) toast('New link made. The old one no longer works.');
        await Share.share({ message });
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: t.space[2] }}>
        <GlyphTitle glyph="link">Invite your whole group</GlyphTitle>
        <AppText variant="small" tone="muted">
          Post one link in your group text or email. Anyone who opens it joins {groupName} right away, no requests to approve.
        </AppText>
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <Button label={Platform.OS === 'web' ? 'Copy invite link' : 'Share invite link'} size="md" style={{ flex: 1 }} onPress={() => share(false)} loading={busy} />
          <Button label="New link" size="md" variant="ghost" onPress={() => share(true)} disabled={busy} accessibilityLabel="Make a new link. The old one stops working." />
        </View>
      </View>
    </Card>
  );
}
