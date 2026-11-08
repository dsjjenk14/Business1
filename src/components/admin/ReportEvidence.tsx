import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { fetchEvidence, type ReportEvidence as Evidence } from '@/features/admin/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** Records saved when the report came in, and both people's history. Loaded on tap. */
export function ReportEvidence({ reportId }: { reportId: number }) {
  const t = useTheme();
  const [ev, setEv] = useState<Evidence | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState(false);

  function toggle() {
    setOpen((o) => !o);
    if (!ev)
      fetchEvidence(reportId)
        .then(setEv)
        .catch((e) => setError(friendlyError(e)));
  }

  const s = ev?.saved ?? {};
  const met = s.met_in_person ?? [];
  const dates = s.date_requests ?? [];
  const modes = s.date_mode ?? [];
  const msgs = s.messages ?? [];
  const shown = allMessages ? msgs : msgs.slice(-12);

  return (
    <View style={{ gap: t.space[2] }}>
      <Button label={open ? 'Hide evidence' : 'Show evidence'} size="md" variant="ghost" onPress={toggle} />
      {open ? (
        <View style={{ gap: t.space[3], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}>
          {error ? <AppText tone="danger">{error}</AppText> : null}
          {!ev && !error ? <AppText tone="muted">Loading…</AppText> : null}
          {ev ? (
            <>
              <Block title="Met in person">
                {met.length === 0 ? (
                  <Line>No record of them being in the same place.</Line>
                ) : (
                  met.map((m, i) => (
                    <Line key={i}>
                      {dayTime(m.at)} · {m.place ?? 'unknown place'} · {m.context}
                    </Line>
                  ))
                )}
              </Block>
              <Block title="Date plans">
                {dates.length === 0 ? (
                  <Line>None.</Line>
                ) : (
                  dates.map((d, i) => (
                    <Line key={i}>
                      {dayTime(d.created_at)} · {d.status}
                      {d.place_text ? ` · ${d.place_text}` : ''}
                      {d.note ? ` · “${d.note}”` : ''}
                    </Line>
                  ))
                )}
              </Block>
              <Block title="Date Mode and safety alerts">
                {modes.length === 0 ? (
                  <Line>Date Mode wasn’t used with this person.</Line>
                ) : (
                  modes.map((m, i) => (
                    <Line key={i}>
                      {m.activated_at ? dayTime(m.activated_at) : 'Not started'} · {m.status}
                      {m.last_problem ? ` · problem: ${m.last_problem}` : ''}
                      {m.alerts.length ? ` · alerts: ${m.alerts.map((a) => `${a.who} ${a.level} at ${dayTime(a.at)}`).join(', ')}` : ''}
                    </Line>
                  ))
                )}
              </Block>
              <Block title={`Messages between them (${msgs.length})`}>
                {msgs.length === 0 ? <Line>No messages.</Line> : null}
                {shown.map((m, i) => (
                  <Line key={i}>
                    <AppText variant="small" weight="bold" style={{ color: m.from === 'reported' ? t.colors.danger : t.colors.text }}>
                      {m.from === 'reported' ? 'Reported' : 'Reporter'}:
                    </AppText>{' '}
                    {m.body} <AppText variant="caption" tone="subtle">{dayTime(m.at)}</AppText>
                  </Line>
                ))}
                {msgs.length > shown.length ? <Button label={`Show all ${msgs.length}`} size="md" variant="ghost" onPress={() => setAllMessages(true)} /> : null}
              </Block>
              <Block title="The reported member">
                <Line>
                  Reported by {ev.independent_reporters} different {ev.independent_reporters === 1 ? 'person' : 'people'} · {ev.serious_reports} serious
                  report{ev.serious_reports === 1 ? '' : 's'} · {ev.vouches_taken_back_90d} vouch{ev.vouches_taken_back_90d === 1 ? '' : 'es'} taken back in 90 days
                </Line>
                {ev.past_actions.map((a, i) => (
                  <Line key={i}>
                    {dayTime(a.at)} · {a.action}
                    {a.note ? ` · ${a.note}` : ''}
                  </Line>
                ))}
              </Block>
              <Block title="The reporter">
                <Line>
                  Made {ev.reporter_reports_made} report{ev.reporter_reports_made === 1 ? '' : 's'} · {ev.reporter_reports_dismissed} dismissed · was reported{' '}
                  {ev.reporter_was_reported} time{ev.reporter_was_reported === 1 ? '' : 's'}
                </Line>
              </Block>
              <AppText variant="caption" tone="subtle">
                Saved when the report came in, and kept even if either account is deleted. Police need a warrant for messages (a subpoena for other records), except in an
                emergency where someone could be hurt.
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[1] }}>
      <AppText variant="caption" weight="bold" tone="muted">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <AppText variant="small">{children}</AppText>;
}
