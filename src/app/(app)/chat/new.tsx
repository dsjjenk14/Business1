import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { PeoplePicker } from '@/components/chat/PeoplePicker';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, EmptyState, LoadingList, Screen, Section, TextField, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { addToGroupChat, createGroupChat, fetchChatCandidates, fetchConversation, type ChatCandidate } from '@/features/chat/api';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Start a group chat (or, with ?add=<chat id>, add people to one).
 * You can add your Insiders and people you've chatted with.
 */
export default function NewGroupChat() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const addTo = add ? Number(add) : null;
  const [people, setPeople] = useState<ChatCandidate[] | null>(null);
  const [already, setAlready] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchChatCandidates()
      .then(setPeople)
      .catch(() => setPeople([]));
    if (addTo) {
      fetchConversation(addTo)
        .then((c) => setAlready((c?.members ?? []).map((m) => m.id)))
        .catch(() => undefined);
    }
  }, [addTo]);

  const shown = useMemo(
    () => (people ?? []).filter((p) => p.display_name.toLowerCase().includes(filter.trim().toLowerCase())),
    [people, filter],
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const need = addTo ? 1 : 2;
  async function submit() {
    setBusy(true);
    try {
      if (addTo) {
        const n = await addToGroupChat(addTo, [...selected]);
        toast(n === 1 ? 'Added 1 person' : `Added ${n} people`);
        router.back();
      } else {
        const id = await createGroupChat(name, [...selected]);
        track('group_chat_created', { people: selected.size });
        router.replace({ pathname: '/chat/[id]', params: { id: String(id) } });
      }
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <BackHeader title={addTo ? 'Add people' : 'New group chat'} />
      <Screen contentGap={t.space[4]}>
        {!addTo ? (
          <TextField label="Chat name" optional value={name} onChangeText={setName} maxLength={60} placeholder="Brunch crew, Book club…" />
        ) : null}
        {people === null ? (
          <LoadingList />
        ) : people.length === 0 ? (
          <EmptyState
            glyph="people"
            title="No one to add yet"
            body="You can add your Insiders and people you’ve chatted with. Connect with someone first (Insiders → Add someone)."
            action={{ label: 'Add someone', onPress: () => router.push('/connect') }}
          />
        ) : (
          <>
            {people.length > 8 ? <TextField label="Search" value={filter} onChangeText={setFilter} autoCapitalize="none" /> : null}
            <Section title={selected.size ? `${selected.size} selected` : addTo ? 'Who should join?' : 'Who’s in the chat?'}>
              <PeoplePicker people={shown} selected={selected} onToggle={toggle} exclude={already} />
            </Section>
          </>
        )}
        {people?.length ? (
          <>
            <Button
              label={addTo ? 'Add to chat' : 'Start chat'}
              onPress={submit}
              loading={busy}
              disabled={selected.size < need}
            />
            {!addTo && selected.size < 2 ? (
              <AppText variant="caption" tone="subtle" align="center">
                Pick at least two people. For one person, just message them.
              </AppText>
            ) : null}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
