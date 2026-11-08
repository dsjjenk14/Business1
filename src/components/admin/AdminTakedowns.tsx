import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, TextField, useToast } from '@/components/ui';
import { declineTakedown, fetchTakedowns, removeTakedown, type Takedown } from '@/features/admin/api';
import { confirmThen } from '@/lib/confirm';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

function left(due: string, now: number) {
  const ms = new Date(due).getTime() - now;
  if (ms <= 0) return { text: 'Overdue', urgent: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { text: `${h}h ${m}m left`, urgent: h < 12 };
}

const WHAT: Record<string, string> = { post: 'A post', out: 'An Out', profile_photo: 'Profile photos', other: 'Somewhere else' };

/** Intimate image removal requests, with the 48-hour clock. Shown at the top of Reports while any are open. */
export function AdminTakedowns({ onChange }: { onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Takedown[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const load = useCallback(() => {
    fetchTakedowns()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useFocusEffect(load);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      load();
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const open = rows.filter((r) => r.status === 'open');
  if (open.length === 0) return null;
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Intimate image removal requests ({open.length})
      </AppText>
      <AppText variant="small" tone="muted">
        Federal law: remove within 48 hours of the request, along with any copies you find. When in doubt, remove it.
      </AppText>
      {open.map((r) => {
        const clock = left(r.due_at, now);
        const target = r.pin_id || r.out_id || (r.kind === 'profile_photo' && r.poster_id);
        return (
          <Card key={r.id} accent="primary">
            <View style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                <AppText weight="bold" style={{ flex: 1 }}>
                  {WHAT[r.kind] ?? r.kind}
                  {r.poster_name ? ` from ${r.poster_name}` : ''} · #{r.code}
                </AppText>
                <AppText variant="small" weight="bold" style={{ color: clock.urgent ? t.colors.danger : t.colors.textMuted }}>
                  {clock.text}
                </AppText>
              </View>
              {r.held ? (
                <AppText variant="caption" tone="subtle">
                  Already hidden while you review.
                </AppText>
              ) : null}
              {r.pin_body ? (
                <AppText variant="small" style={{ fontStyle: 'italic' }}>
                  “{r.pin_body}”
                </AppText>
              ) : null}
              {r.location ? (
                <AppText variant="small">
                  <AppText variant="small" weight="bold">Where: </AppText>
                  {r.location}
                </AppText>
              ) : null}
              <AppText variant="small">
                <AppText variant="small" weight="bold">Statement: </AppText>
                {r.statement}
              </AppText>
              <AppText variant="caption" tone="subtle">
                Signed {r.signature}
                {r.for_self ? ' (the person shown)' : ' (acting for the person shown)'} · {r.contact}
                {r.requester_name ? ` · member ${r.requester_name}` : ' · no account'} · {dayTime(r.created_at)}
              </AppText>
              {!target ? (
                <AppText variant="small" tone="muted">
                  Find it from the description, remove it with the other admin tools (or remove the member), then mark it removed here.
                </AppText>
              ) : r.kind === 'profile_photo' ? (
                <AppText variant="small" tone="muted">
                  Removing deletes all of this member’s profile photos.
                </AppText>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                <Button
                  label={target ? 'Remove for good' : 'Mark removed'}
                  size="md"
                  variant="danger"
                  disabled={busy}
                  onPress={() =>
                    confirmThen(
                      target ? 'Remove it for good?' : 'Mark as removed?',
                      target ? 'The image and its files are deleted. This can’t be undone.' : 'Only do this after you’ve taken it down.',
                      () => run(() => removeTakedown(r.id, notes[r.id]), 'Removed'),
                      'Remove',
                    )
                  }
                />
              </View>
              <TextField
                label="Note"
                optional
                hint="Required if you don’t remove it: say why (for example, it isn’t an intimate image)."
                value={notes[r.id] ?? ''}
                onChangeText={(v) => setNotes((n) => ({ ...n, [r.id]: v }))}
                maxLength={500}
              />
              {(notes[r.id] ?? '').trim().length >= 3 ? (
                <Button label="Don’t remove" size="md" variant="ghost" disabled={busy} onPress={() => run(() => declineTakedown(r.id, notes[r.id] ?? ''), 'Closed')} />
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
