import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, GlyphTitle, Screen, Section, useToast } from '@/components/ui';
import { fetchMeetups, requestVouch, type Meetup } from '@/features/circles/api';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';

/** Ask someone you met (GPS-confirmed, last 14 days) to vouch for you. */
export default function RequestVouch() {
  const router = useRouter();
  const toast = useToast();
  const [meetups, setMeetups] = useState<Meetup[] | null>(null);
  const [asked, setAsked] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchMeetups().then(setMeetups).catch(() => setMeetups([]));
    }, []),
  );

  async function ask(m: Meetup) {
    try {
      await requestVouch(m.user_id);
      setAsked((a) => [...a, m.user_id]);
      toast(`Asked ${m.display_name}`);
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  const people = Array.from(new Map((meetups ?? []).map((m) => [m.user_id, m])).values());

  return (
    <>
      <BackHeader title="Request a Vouch" />
      <Screen>
        <AppText tone="muted">
          After meeting someone in person, you can ask them to vouch for you. They choose one word that describes what it was like to spend
          time with you. Only ask people you&apos;ve actually spent time with.
        </AppText>
        <Section title="People you met recently">
          {meetups && people.length === 0 ? (
            <AppText variant="small" tone="muted">
              Nobody yet. Check in together the next time you&apos;re out with someone.
            </AppText>
          ) : (
            people.map((m) => (
              <PersonRow
                key={m.user_id}
                id={m.user_id}
                name={m.display_name}
                avatarUrl={m.avatar_url}
                vouches={m.vouch_count}
                detail={`Met${m.place_label ? ` at ${m.place_label}` : ''} · ${timeAgo(m.met_at)}`}
                right={
                  asked.includes(m.user_id) ? (
                    <AppText variant="caption" tone="subtle">
                      Asked ✓
                    </AppText>
                  ) : (
                    <Button label="Ask" size="md" variant="secondary" onPress={() => ask(m)} />
                  )
                }
              />
            ))
          )}
        </Section>
        <Card onPress={() => router.push('/circles/vouch')} accessibilityLabel="Check in with someone">
          <GlyphTitle glyph="pin">With someone now?</GlyphTitle>
          <AppText variant="small" tone="muted">
            Check in together first, then you can ask each other for vouches.
          </AppText>
        </Card>
      </Screen>
    </>
  );
}
