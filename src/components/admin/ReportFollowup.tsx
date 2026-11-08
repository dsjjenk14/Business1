import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { AppText, Button, Chip, TextField, useToast } from '@/components/ui';
import { askReporter, policePacket, type AdminReport, type PoliceBasis, type PolicePacket } from '@/features/admin/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

type Thread = { from_admin: boolean; body: string; at: string }[];
const POLICE_LABEL: Record<string, string> = { reported: 'Reported to police', not_yet: 'Hasn’t gone to police yet', no: 'Doesn’t want to go to police' };

/** What the reporter told us (when, where, police), the conversation with them, and a box to ask more. */
export function ReporterAnswers({ r, onChange }: { r: AdminReport; onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const thread = (r.thread ?? []) as Thread;

  async function ask() {
    setBusy(true);
    try {
      await askReporter(r.id, question);
      setQuestion('');
      toast('Sent. They’ll see it in My reports.');
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: t.space[2] }}>
      {r.incident_when || r.incident_place ? (
        <AppText variant="small">
          <AppText variant="small" weight="bold">When: </AppText>
          {r.incident_when ?? '–'}
          {'   '}
          <AppText variant="small" weight="bold">Where: </AppText>
          {r.incident_place ?? '–'}
        </AppText>
      ) : null}
      {r.police_status ? (
        <AppText variant="small">
          <AppText variant="small" weight="bold">Police: </AppText>
          {POLICE_LABEL[r.police_status]}
          {r.police_agency ? `, ${r.police_agency}` : ''}
          {r.police_case ? `, case ${r.police_case}` : ''}
          {' · '}
          {r.share_with_police ? 'agreed to share messages with police' : 'hasn’t agreed to share messages'}
          {r.sent_to_police ? ` · records sent ${r.sent_to_police} time${r.sent_to_police === 1 ? '' : 's'}` : ''}
        </AppText>
      ) : null}
      {thread.map((m, i) => (
        <AppText key={i} variant="small" tone={m.from_admin ? 'muted' : undefined}>
          <AppText variant="small" weight="bold">{m.from_admin ? 'You asked: ' : 'Reporter: '}</AppText>
          {m.body} <AppText variant="caption" tone="subtle">{dayTime(m.at)}</AppText>
        </AppText>
      ))}
      {r.can_contact ? (
        <View style={{ gap: t.space[2] }}>
          <TextField label="Ask the reporter" hint="Only they see it, in My reports." value={question} onChangeText={setQuestion} maxLength={2000} />
          {question.trim() ? <Button label="Send question" size="md" variant="secondary" onPress={ask} loading={busy} /> : null}
        </View>
      ) : (
        <AppText variant="caption" tone="subtle">
          The reporter asked not to be contacted.
        </AppText>
      )}
    </View>
  );
}

const BASES: { key: PoliceBasis; label: string; detail: string }[] = [
  { key: 'reporter_consent', label: 'Reporter agreed', detail: 'Messages and date plans between the two. Location records aren’t included.' },
  { key: 'legal_process', label: 'Subpoena or warrant', detail: 'Everything saved. Have your lawyer check the paperwork first.' },
  { key: 'emergency', label: 'Emergency', detail: 'Someone could be killed or seriously hurt right now. Everything saved.' },
];

function packetText(p: PolicePacket) {
  const lines = [
    `I’m In: records for report #${p.report.id}`,
    `Prepared ${new Date().toLocaleString('en-US')} for ${p.agency}${p.case ? `, case ${p.case}` : ''}`,
    `Basis: ${BASES.find((b) => b.key === p.basis)?.label}`,
    '',
    `Reported by: ${p.report.reporter ?? 'deleted account'}`,
    `About: ${p.report.reported ?? 'deleted account'}`,
    `Filed: ${new Date(p.report.filed_at).toLocaleString('en-US')}`,
    `When it happened (reporter’s words): ${p.report.incident_when ?? '–'}`,
    `Where (reporter’s words): ${p.report.incident_place ?? '–'}`,
    `What happened (reporter’s words): ${p.report.details}`,
    '',
    `Messages between them (${p.messages.length}), oldest first:`,
    ...p.messages.map((m) => `[${new Date(m.at).toLocaleString('en-US')}] ${m.from === 'reporter' ? 'Reporter' : 'Reported member'}: ${m.body}`),
    '',
    `Date plans (${p.date_requests.length}):`,
    ...p.date_requests.map((d) => `[${new Date(d.created_at).toLocaleString('en-US')}] ${d.status}${d.place_text ? `, ${d.place_text}` : ''}${d.note ? `, note: "${d.note}"` : ''}`),
  ];
  if (p.met_in_person)
    lines.push('', 'Same place at the same time:', ...p.met_in_person.map((m) => `${new Date(m.at).toLocaleString('en-US')} to ${new Date(m.until).toLocaleString('en-US')}, ${m.place ?? 'unknown place'} (${m.context})`));
  if (p.date_mode)
    lines.push('', 'Date Mode:', ...p.date_mode.map((d) => `${d.activated_at ? new Date(d.activated_at).toLocaleString('en-US') : 'not started'}, ${d.status}${d.alerts.length ? `, alerts: ${d.alerts.map((a) => `${a.who} ${a.level} ${new Date(a.at).toLocaleString('en-US')}`).join('; ')}` : ''}`));
  lines.push('', 'Saved automatically by I’m In when the report was filed.');
  return lines.join('\n');
}

/** Prepare the records for police, with the legal reason, and hand them to the share sheet (or copy on the web). */
export function SendToPolice({ r, onChange }: { r: AdminReport; onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<PoliceBasis>(r.share_with_police ? 'reporter_consent' : 'legal_process');
  const [agency, setAgency] = useState(r.police_agency ?? '');
  const [caseNumber, setCaseNumber] = useState(r.police_case ?? '');
  const [busy, setBusy] = useState(false);

  async function prepare() {
    setBusy(true);
    try {
      const text = packetText(await policePacket(r.id, basis, agency, caseNumber));
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(text);
        toast('Copied. Paste it into an email to the officer.');
      } else await Share.share({ message: text, title: `I’m In report #${r.id}` });
      setOpen(false);
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button label="Send records to police" size="md" variant="ghost" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: t.space[2], padding: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}>
      <AppText weight="bold">Why are you sharing?</AppText>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        {BASES.map((b) => (
          <Chip key={b.key} label={b.label} selected={basis === b.key} onPress={() => setBasis(b.key)} />
        ))}
      </View>
      <AppText variant="small" tone="muted">
        {BASES.find((b) => b.key === basis)?.detail}
      </AppText>
      {basis === 'reporter_consent' && !r.share_with_police ? (
        <AppText variant="small" tone="danger">
          The reporter hasn’t agreed yet. Ask them first.
        </AppText>
      ) : null}
      <TextField label="Police department" value={agency} onChangeText={setAgency} maxLength={120} />
      <TextField label="Case number" optional value={caseNumber} onChangeText={setCaseNumber} maxLength={80} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        <Button label="Prepare records" size="md" onPress={prepare} loading={busy} disabled={!agency.trim()} />
        <Button label="Cancel" size="md" variant="ghost" onPress={() => setOpen(false)} />
      </View>
      <AppText variant="caption" tone="subtle">
        Every time records are prepared, it’s logged with the reason.
      </AppText>
    </View>
  );
}
