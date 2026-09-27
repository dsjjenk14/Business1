import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Avatar, Button, Card, Screen, Section, useToast } from '@/components/ui';
import { declineIntroRequest, fetchIntros, respondIntro, type MyIntros } from '@/features/circles/api';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** Intros waiting on you: people introduced to you, and people asking you to connect them. */
export default function Intros() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<MyIntros | null>(null);

  const load = useCallback(() => {
    fetchIntros().then(setData).catch(() => {});
  }, []);
  useFocusEffect(load);

  async function respond(id: number, accept: boolean, name: string) {
    try {
      const result = await respondIntro(id, accept);
      toast(accept ? (result === 'connected' ? `You're connected with ${name}` : `Accepted. Waiting on ${name}.`) : 'Passed. No explanation needed.');
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  async function decline(id: number) {
    try {
      await declineIntroRequest(id);
      toast('Declined');
      load();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <>
      <BackHeader title="Intros" />
      <Screen>
        <Section title="Introduced to you">
          {data?.to_answer.length ? (
            data.to_answer.map((i) => (
              <Card key={i.id}>
                <View style={{ gap: t.space[3] }}>
                  <AppText variant="small" tone="muted">
                    {i.connector.display_name} wants you to meet · {timeAgo(i.created_at)}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                    <Avatar name={i.other.display_name} uri={i.other.avatar_url} size={48} />
                    <View style={{ flex: 1 }}>
                      <AppText weight="bold">{i.other.display_name}</AppText>
                      <AppText variant="caption" tone="subtle">
                        {[i.other.vouch_count != null ? `${i.other.vouch_count} vouches` : null, i.other.headline].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                  </View>
                  <AppText>&ldquo;{i.message}&rdquo;</AppText>
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button label="✓ I'm In" size="md" style={{ flex: 1 }} onPress={() => respond(i.id, true, i.other.display_name)} />
                    <Button label="Pass" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => respond(i.id, false, i.other.display_name)} />
                  </View>
                  <Button
                    label={`View ${i.other.display_name.split(' ')[0]}'s profile`}
                    size="md"
                    variant="ghost"
                    onPress={() => router.push({ pathname: '/people/[id]', params: { id: i.other.id } })}
                  />
                </View>
              </Card>
            ))
          ) : (
            <AppText variant="small" tone="muted">
              Nothing waiting.
            </AppText>
          )}
        </Section>

        <Section title="Asking you to connect them">
          {data?.requests.length ? (
            data.requests.map((r) => (
              <Card key={r.id}>
                <View style={{ gap: t.space[3] }}>
                  <AppText>
                    <AppText weight="bold">{r.requester.display_name}</AppText> wants an intro to <AppText weight="bold">{r.target.display_name}</AppText>
                  </AppText>
                  {r.note ? (
                    <AppText variant="small" tone="muted">
                      &ldquo;{r.note}&rdquo;
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      label="Make the intro"
                      size="md"
                      style={{ flex: 1 }}
                      onPress={() =>
                        router.push({
                          pathname: '/circles/make-intro',
                          params: { a: r.requester.id, b: r.target.id, request: String(r.id), message: r.note ?? '' },
                        })
                      }
                    />
                    <Button label="Not now" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => decline(r.id)} />
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <AppText variant="small" tone="muted">
              No requests right now.
            </AppText>
          )}
        </Section>
      </Screen>
    </>
  );
}
