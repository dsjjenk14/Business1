import { Switch, View } from 'react-native';

import { AppText, Button, Card, Chip, TextField } from '@/components/ui';
import type { Incident, PoliceStatus } from '@/features/safety/api';
import { callNumber } from '@/lib/sms';
import { useTheme } from '@/theme';

/** A strong, plain push to report to police, without making it a condition of reporting to us. */
export function PoliceEncouragement({ after }: { after?: boolean }) {
  const t = useTheme();
  return (
    <Card accent="primary" style={{ gap: t.space[2] }}>
      <AppText weight="bold" accessibilityRole="header">
        {after ? 'Next: please tell the police' : 'Please report this to the police'}
      </AppText>
      <AppText variant="small" tone="muted">
        We strongly encourage it. Police can investigate in ways we can’t, and reporting soon helps keep evidence. It’s still your choice, and you
        can do it later.
      </AppText>
      <AppText variant="small" tone="muted">
        {'• Call 911, or 311 in DC if it isn’t an emergency, and say you want to report a crime.\n'}
        {'• Keep screenshots, texts and receipts. If you’re getting a medical exam, try not to shower or change first, but go even if you have.\n'}
        {after
          ? '• When you have a case number, add it in Settings, My reports, and we’ll send police the messages between you two.'
          : '• With your OK, we give police the messages between you two and your date plans, so you don’t have to.'}
      </AppText>
      <Button label="Call 311 (DC, not an emergency)" size="md" variant="secondary" onPress={() => callNumber('311')} />
    </Card>
  );
}

const POLICE: { key: PoliceStatus; label: string }[] = [
  { key: 'reported', label: 'Yes' },
  { key: 'not_yet', label: 'Not yet' },
  { key: 'no', label: 'I don’t want to' },
];

/** Police status, consent to share messages with police, and whether our team may follow up. */
export function PoliceQuestions({ value, onChange, name }: { value: Incident; onChange: (i: Incident) => void; name: string }) {
  const t = useTheme();
  const set = (patch: Partial<Incident>) => onChange({ ...value, ...patch });
  return (
    <View style={{ gap: t.space[4] }}>
      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Have you told the police?</AppText>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {POLICE.map((p) => (
            <Chip key={p.key} label={p.label} selected={value.police === p.key} onPress={() => set({ police: p.key })} />
          ))}
        </View>
        {value.police === 'reported' ? (
          <>
            <TextField label="Police department" placeholder="For example, DC Metropolitan Police" value={value.agency ?? ''} onChangeText={(agency) => set({ agency })} maxLength={120} />
            <TextField label="Case number" optional value={value.caseNumber ?? ''} onChangeText={(caseNumber) => set({ caseNumber })} maxLength={80} />
          </>
        ) : null}
      </View>
      <View style={{ gap: t.space[2] }}>
        <AppText weight="bold">Can we give the police the messages between you and {name}?</AppText>
        <AppText variant="small" tone="muted">
          If police investigate, we’ll send them your messages and date plans with this person. We only share with your OK, and you can change your
          answer later in Settings, My reports.
        </AppText>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          <Chip label="Yes, share them" selected={value.shareWithPolice === true} onPress={() => set({ shareWithPolice: true })} />
          <Chip label="No" selected={value.shareWithPolice === false} onPress={() => set({ shareWithPolice: false })} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold">Our safety team can message me</AppText>
          <AppText variant="small" tone="muted">
            Only in the app, if we need more details. {name === 'them' ? 'They' : name} will never see it.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Our safety team can message me"
          value={value.canContact}
          onValueChange={(canContact) => set({ canContact })}
          trackColor={{ true: t.colors.primary, false: t.colors.surfaceAlt }}
        />
      </View>
    </View>
  );
}
