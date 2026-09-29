import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Glyph, TextField, useToast } from '@/components/ui';
import { track } from '@/features/analytics/track';
import { createPoll, fetchPoll, votePoll, type ChatPoll } from '@/features/chat/api';
import { haptic } from '@/lib/haptics';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** A poll in a chat. Tap a choice to vote, another to switch, the same one to take it back. */
export function PollCard({ pollId, mine }: { pollId: number; mine: boolean }) {
  const t = useTheme();
  const toast = useToast();
  const [poll, setPoll] = useState<ChatPoll | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchPoll(pollId)
      .then(setPoll)
      .catch(() => setPoll(null));
  }, [pollId]);

  useEffect(() => {
    load();
    // Pick up other people's votes while the chat is open.
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function vote(option: number) {
    if (!poll || busy) return;
    haptic.select();
    setBusy(true);
    // Show the vote right away; the server has the final say.
    const counts = [...poll.counts];
    const bump = (i: number, by: number) => (counts[i] = (counts[i] ?? 0) + by);
    if (poll.mine != null) bump(poll.mine, -1);
    const takingBack = poll.mine === option;
    if (!takingBack) bump(option, 1);
    setPoll({ ...poll, counts, mine: takingBack ? null : option, voters: poll.voters + (poll.mine == null ? 1 : takingBack ? -1 : 0) });
    try {
      await votePoll(poll.id, option);
      track('poll_vote');
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
      load();
    }
  }

  const border = mine ? t.colors.primary : t.colors.border;
  if (poll === undefined) {
    return <View style={{ width: 260, height: 140, borderRadius: t.radius.lg, borderWidth: t.borderWidth.regular, borderColor: border, backgroundColor: t.colors.surface }} />;
  }
  if (poll === null) {
    return (
      <AppText variant="small" tone="subtle">
        This poll isn&apos;t available.
      </AppText>
    );
  }
  const top = Math.max(...poll.counts);
  return (
    <View
      style={{
        width: 280,
        maxWidth: '100%',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: t.borderWidth.regular,
        borderColor: border,
        backgroundColor: t.colors.surface,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <Glyph name="pin" size={16} tone="primary" strokeWidth={2} />
        <AppText weight="bold" style={{ flex: 1 }}>
          {poll.question}
        </AppText>
      </View>
      {poll.options.map((label, i) => {
        const count = poll.counts[i] ?? 0;
        const share = poll.voters ? count / poll.voters : 0;
        const chosen = poll.mine === i;
        const leading = count > 0 && count === top;
        return (
          <Pressable
            key={i}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            aria-checked={chosen}
            accessibilityLabel={`${label}, ${count} vote${count === 1 ? '' : 's'}`}
            onPress={() => vote(i)}
            style={({ pressed }) => ({
              minHeight: 44,
              borderRadius: t.radius.md,
              borderWidth: t.borderWidth.regular,
              borderColor: chosen ? t.colors.primary : t.colors.border,
              overflow: 'hidden',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.round(share * 100)}%`,
                backgroundColor: t.colors.surfaceAlt,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], paddingHorizontal: t.space[3] }}>
              {chosen ? <Glyph name="check" size={16} tone="primary" strokeWidth={2.4} /> : null}
              <AppText weight={leading || chosen ? 'bold' : undefined} style={{ flex: 1 }} numberOfLines={2}>
                {label}
              </AppText>
              <AppText variant="small" tone="muted">
                {count}
              </AppText>
            </View>
          </Pressable>
        );
      })}
      <AppText variant="caption" tone="subtle">
        {poll.voters === 0 ? 'No votes yet' : `${poll.voters} vote${poll.voters === 1 ? '' : 's'}`}
        {poll.mine != null ? ' · Tap your choice again to take it back' : ''}
      </AppText>
    </View>
  );
}

/** Start a poll: a question (Where tonight? by default) and 2 to 4 choices. */
export function PollComposer({ conversationId, onClose, onPosted }: { conversationId: number; onClose: () => void; onPosted: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);

  async function post() {
    if (filled.length < 2 || busy) return;
    setBusy(true);
    try {
      await createPoll(conversationId, question.trim() || 'Where tonight?', filled);
      track('poll_created', { options: filled.length });
      onPosted();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: t.space[2], padding: t.space[4], borderTopWidth: t.borderWidth.hairline, borderTopColor: t.colors.border, backgroundColor: t.colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="h3" style={{ flex: 1 }}>
          New poll
        </AppText>
        <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
      </View>
      <TextField label="Question" placeholder="Where tonight?" value={question} onChangeText={setQuestion} maxLength={120} />
      {options.map((o, i) => (
        <TextField
          key={i}
          label={`Choice ${i + 1}`}
          placeholder={i === 0 ? 'Somewhere on U Street' : i === 1 ? 'The Wharf' : 'Another spot'}
          value={o}
          maxLength={60}
          optional={i >= 2}
          onChangeText={(v) => setOptions((list) => list.map((x, j) => (j === i ? v : x)))}
        />
      ))}
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        {options.length < 4 ? <Button label="Add a choice" variant="secondary" size="md" onPress={() => setOptions((l) => [...l, ''])} style={{ flex: 1 }} /> : null}
        <Button label="Post poll" size="md" onPress={post} loading={busy} disabled={filled.length < 2} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
