import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { PoliceEncouragement, PoliceQuestions } from '@/components/safety/PoliceQuestions';
import { AppText, Button, Card, EmptyState, LoadingList, Screen, TextField, useToast } from '@/components/ui';
import { REPORT_REASONS, answerReportQuestion, fetchReportDetail, reportIncident, type Incident, type ReportDetail } from '@/features/safety/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime } from '@/lib/time';
import { useTheme } from '@/theme';

/** One of your reports: questions from our safety team, and police details you can add later. */
export default function MyReport() {
  const t = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<ReportDetail | null | undefined>(undefined);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchReportDetail(Number(id))
      .then((d) => {
        setR(d);
        if (d)
          setIncident({
            when: d.incident_when ?? '',
            place: d.incident_place ?? '',
            police: d.police_status,
            agency: d.police_agency ?? '',
            caseNumber: d.police_case ?? '',
            shareWithPolice: d.share_with_police,
            canContact: d.can_contact,
          });
      })
      .catch(() => setR(null));
  }, [id]);
  useFocusEffect(load);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      load();
      return true;
    } catch (e) {
      toast(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (r === undefined) return (<><BackHeader title="Your report" /><Screen><LoadingList rows={2} /></Screen></>);
  if (!r || !incident) return (<><BackHeader title="Your report" /><Screen><EmptyState glyph="warning" title="Couldn’t find that report" /></Screen></>);
  const label = REPORT_REASONS.find((x) => x.key === r.reason)?.label ?? r.reason;
  const waiting = r.thread.at(-1)?.from_admin === true;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Your report" />
      <Screen>
        <AppText variant="h2" accessibilityRole="header">
          {label}
        </AppText>
        <AppText tone="muted">Only you and our safety team can see this page.</AppText>

        {r.thread.length ? (
          <View style={{ gap: t.space[2] }}>
            <AppText variant="label" tone="subtle">
              Messages with our safety team
            </AppText>
            {r.thread.map((m, i) => (
              <Card key={i} accent={m.from_admin ? 'ai' : undefined}>
                <AppText variant="caption" weight="bold" tone="muted">
                  {m.from_admin ? 'I’m In safety team' : 'You'} · {dayTime(m.at)}
                </AppText>
                <AppText>{m.body}</AppText>
              </Card>
            ))}
            <TextField
              label={waiting ? 'Your answer' : 'Add something'}
              value={answer}
              onChangeText={setAnswer}
              multiline
              maxLength={2000}
              style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }}
            />
            <Button
              label="Send"
              onPress={() => run(() => answerReportQuestion(r.id, answer), 'Sent to our safety team').then((ok) => ok && setAnswer(''))}
              loading={busy}
              disabled={!answer.trim()}
            />
          </View>
        ) : null}

        {r.serious ? (
          <>
            {incident.police !== 'reported' ? <PoliceEncouragement after /> : null}
            <TextField label="When did it happen?" value={incident.when} onChangeText={(when) => setIncident({ ...incident, when })} maxLength={200} />
            <TextField label="Where?" value={incident.place} onChangeText={(place) => setIncident({ ...incident, place })} maxLength={200} />
            <PoliceQuestions value={incident} onChange={setIncident} name="them" />
            <Button label="Save" variant="secondary" onPress={() => run(() => reportIncident(r.id, incident), 'Saved')} loading={busy} />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
