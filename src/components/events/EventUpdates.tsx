import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, GlyphTitle, TextField, useToast } from '@/components/ui';
import { EVENT_TAGS, fetchEventUpdates, messageEventGuests, setEventTags, tagLabel, type EventTag, type EventUpdate } from '@/features/events/api';
import { friendlyError } from '@/lib/supabase';
import { timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

/** The host's tags on an event: New faces welcome, Low-key, 30+. */
export function EventTagBadges({ tags }: { tags: EventTag[] | null | undefined }) {
  const t = useTheme();
  if (!tags?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
      {tags.map((k) => (
        <Badge key={k} label={tagLabel(k)} tone={k === 'newcomers' ? 'trust' : 'neutral'} />
      ))}
    </View>
  );
}

/**
 * Updates from the host ("Doors moved to 10"). The host can send one to
 * everyone going; the host and everyone going see them here.
 */
export function EventUpdates({ eventId, isHost, goingCount }: { eventId: number; isHost: boolean; goingCount: number }) {
  const t = useTheme();
  const toast = useToast();
  const [updates, setUpdates] = useState<EventUpdate[]>([]);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchEventUpdates(eventId)
      .then(setUpdates)
      .catch(() => undefined);
  }, [eventId]);
  useEffect(load, [load]);

  async function send() {
    setBusy(true);
    try {
      const n = await messageEventGuests(eventId, body);
      toast(n ? `Sent to ${n} ${n === 1 ? 'person' : 'people'} going` : 'Posted. Nobody has said I’m In yet.');
      setBody('');
      setWriting(false);
      load();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isHost && updates.length === 0) return null;

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <GlyphTitle glyph="mail">Updates from the host</GlyphTitle>
        {updates.map((u) => (
          <View key={u.id} style={{ gap: 2 }}>
            <AppText>{u.body}</AppText>
            <AppText variant="caption" tone="subtle">
              {timeAgo(u.created_at) === 'now' ? 'just now' : `${timeAgo(u.created_at)} ago`}
            </AppText>
          </View>
        ))}
        {isHost && !writing ? (
          <Button
            label="Message everyone going"
            variant="secondary"
            size="md"
            onPress={() => setWriting(true)}
            accessibilityLabel={`Message everyone going, ${goingCount} ${goingCount === 1 ? 'person' : 'people'}`}
          />
        ) : null}
        {isHost && writing ? (
          <View style={{ gap: t.space[2] }}>
            <TextField
              label="Your update"
              value={body}
              onChangeText={setBody}
              maxLength={280}
              multiline
              placeholder="Doors moved to 10. Same place."
            />
            <AppText variant="caption" tone="subtle">
              Everyone who said I’m In gets a notification.
            </AppText>
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button label="Send" size="md" style={{ flex: 1 }} onPress={send} loading={busy} disabled={!body.trim()} />
              <Button label="Cancel" size="md" variant="ghost" onPress={() => setWriting(false)} />
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** Tag chips the host can turn on and off (create screen and event page). */
export function EventTagPicker({ value, onChange }: { value: EventTag[]; onChange: (tags: EventTag[]) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        {EVENT_TAGS.map((tag) => {
          const on = value.includes(tag.key);
          return (
            <Chip
              key={tag.key}
              label={tag.label}
              selected={on}
              onPress={() => onChange(on ? value.filter((k) => k !== tag.key) : [...value, tag.key])}
            />
          );
        })}
      </View>
      {value.length ? (
        <AppText variant="caption" tone="muted">
          {EVENT_TAGS.filter((tag) => value.includes(tag.key))
            .map((tag) => tag.hint)
            .join(' ')}
        </AppText>
      ) : null}
    </View>
  );
}

/** On the event page: the host changes tags, saved right away. */
export function HostEventTags({ eventId, tags, onChanged }: { eventId: number; tags: EventTag[]; onChanged: () => void }) {
  const t = useTheme();
  const toast = useToast();
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="muted">
        Tags
      </AppText>
      <EventTagPicker
        value={tags}
        onChange={(next) =>
          setEventTags(eventId, next)
            .then(onChanged)
            .catch((e) => toast(friendlyError(e)))
        }
      />
    </View>
  );
}
