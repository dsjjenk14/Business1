import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, useToast } from '@/components/ui';
import { decideAppeal, fetchAppeals, type Appeal } from '@/features/admin/api';
import { friendlyError } from '@/lib/supabase';
import { dayTime, timeAgo } from '@/lib/time';
import { useTheme } from '@/theme';

const GUIDE: { title: string; body: string }[] = [
  {
    title: 'Urgent first',
    body: 'Sexual assault and in-person violence are at the top. If the two of them met, planned a date or messaged, the member is already on hold, and the two are blocked from each other.',
  },
  {
    title: 'No proof is normal',
    body: 'Most things that happen in person leave no record. Look at what’s saved (messages, where they met, Date Mode alerts), but a lack of proof doesn’t mean it didn’t happen.',
  },
  {
    title: 'Sexual assault after a real meeting: remove',
    body: 'Even without proof. You aren’t deciding guilt like a court; you’re deciding who can use your app. Large dating apps remove members reported for assault.',
  },
  {
    title: 'Patterns decide the rest',
    body: 'Two or more different people reporting the same member for something serious: remove. One serious report with nothing else: suspend 30 days and watch. Vouches taken back recently count too.',
  },
  {
    title: 'Look at the reporter, carefully',
    body: 'Many dismissed reports, or the reported member reported them first, means look closer. It never means ignore an assault report on its own.',
  },
  {
    title: 'The ladder',
    body: 'Warn: a first small thing (rude, spam once). Suspend 7 days: repeated small things or harassment. Suspend 30 days: serious, but not physical (threats in messages, sharing private info). Remove: assault, in-person violence, two or more serious reports, fake identity, under 18, coming back after removal.',
  },
  {
    title: 'Never',
    body: 'Never tell the reported member who reported them or what they said. Never ask the reporter to prove it or to talk to the other person. If the report didn’t hold up, clear the hold.',
  },
  {
    title: 'Police',
    body: 'Encourage the reporter to go to police; their help screen shows how. Police need a warrant for message contents and at least a subpoena for other records, unless it’s an emergency where someone could be killed or seriously hurt (federal Stored Communications Act). Send every request to your lawyer.',
  },
  {
    title: 'Appeals',
    body: 'Look at it fresh. Lift it only if something new shows the decision was wrong.',
  },
];

const EVERYDAY: { title: string; body: string }[] = [
  {
    title: 'Two things with legal deadlines',
    body: 'Intimate images shared without consent (real or AI-made): remove within 48 hours of a request, and remove the member. They show up at the top of this tab with a countdown. Anything sexual involving someone under 18: don’t download or forward it, remove the account, report it to NCMEC’s CyberTipline (required by law), and call your lawyer.',
  },
  {
    title: 'Harassment',
    body: 'Keeps messaging after a no, insults, pins mocking someone. Check the saved messages and whether others reported them. First time: warn. Keeps going: suspend 7 days. Several people, or still going: suspend 30 days or remove. Threats: treat as violence (Urgent).',
  },
  {
    title: '“Made me feel unsafe,” nothing specific',
    body: 'Pushy about going to their place, kept asking where she lives, showed up where he knew she’d be. One vague report is information, not proof: warn and watch. Two or more people: suspend 30 days or remove. Following someone or showing up uninvited more than once is stalking: Urgent, remove.',
  },
  {
    title: 'Unwanted sexual messages or photos',
    body: 'A nude nobody asked for, sexual comments on a pin. Remove it and suspend 30 days. Again: remove.',
  },
  {
    title: 'Hate',
    body: 'A slur in a reply, a pin attacking a group. Remove it. One-off: warn or suspend 7 days. Aimed at a person, or again: remove.',
  },
  {
    title: 'Fake or misleading',
    body: 'Old but real photos: warn and ask them to update. Someone else’s photos, or pretending to be a real person: remove. Not sure: ask them to verify again with a selfie.',
  },
  {
    title: 'Privacy',
    body: 'Screenshots of private messages, someone’s phone number or workplace: remove it, warn, suspend if it happens again. A home address (doxxing): remove the member; it can put someone in danger.',
  },
  {
    title: 'Spam and scams',
    body: 'Selling or promotion: remove it and warn; again, remove. Asking anyone for money (“I’ll pay you back”): remove right away. That’s the classic romance scam.',
  },
  {
    title: 'Fake vouches',
    body: 'Vouch rings or paid vouches: take the vouches back and remove the accounts involved.',
  },
  {
    title: 'Hosts and events',
    body: 'Not as described, host didn’t show, refund fights: hosts decide refunds (it’s in the Terms), so point the member to the host and warn the host. Repeated: stop them hosting. Problems with a bar itself go to the venue.',
  },
  {
    title: 'Not a rule break',
    body: '“He was boring,” “she ghosted me,” “didn’t show up,” “rude at the bar.” Dismiss kindly and suggest blocking. Punishing bad manners makes reports mean less.',
  },
  {
    title: 'Revenge reports',
    body: 'Exes reporting each other, someone reporting a whole group. Check the reporter’s history in the evidence panel. Don’t act on the report alone. Both harassing each other: warn both. A pattern of false reports gets the reporter removed.',
  },
];

/** The written rules for deciding reports. Collapsed until opened. */
export function DecisionGuide() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
          <AppText weight="bold" accessibilityRole="header">
            How to decide
          </AppText>
          <Button label={open ? 'Hide' : 'Read'} size="md" variant="ghost" onPress={() => setOpen((o) => !o)} />
        </View>
        {open
          ? ([
              ['Serious and in person', GUIDE],
              ['Everyday reports', EVERYDAY],
            ] as const).map(([heading, items]) => (
              <View key={heading} style={{ gap: t.space[2] }}>
                <AppText variant="label" tone="subtle">
                  {heading}
                </AppText>
                {items.map((g, i) => (
                  <View key={g.title} style={{ gap: 2 }}>
                    <AppText variant="small" weight="bold">
                      {i + 1}. {g.title}
                    </AppText>
                    <AppText variant="small" tone="muted">
                      {g.body}
                    </AppText>
                  </View>
                ))}
              </View>
            ))
          : null}
      </View>
    </Card>
  );
}

/** Members on hold, suspended or removed who asked for a second look. Hidden when there are none. */
export function AdminAppeals({ onChange }: { onChange: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Appeal[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetchAppeals()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  async function decide(a: Appeal, lift: boolean) {
    setBusy(true);
    try {
      await decideAppeal(a.id, lift);
      toast(lift ? 'Account restored' : 'Decision kept');
      load();
      onChange();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return null;
  return (
    <View style={{ gap: t.space[2] }}>
      <AppText variant="label" tone="subtle">
        Asked for a second look ({rows.length})
      </AppText>
      {rows.map((a) => {
        const history = (a.history ?? []) as { action: string; note: string | null; at: string }[];
        const state = a.banned ? 'Removed' : a.suspended_until ? `Suspended until ${dayTime(a.suspended_until)}` : a.under_review ? 'On hold' : 'Active';
        return (
          <Card key={a.id} accent="ai">
            <View style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
                <AppText weight="bold" style={{ flex: 1 }}>
                  {a.name ?? 'Member'} · {state}
                </AppText>
                <AppText variant="caption" tone="subtle">
                  {timeAgo(a.created_at)}
                </AppText>
              </View>
              <AppText variant="small" style={{ fontStyle: 'italic' }}>
                “{a.message}”
              </AppText>
              {history.map((h, i) => (
                <AppText key={i} variant="caption" tone="subtle">
                  {dayTime(h.at)} · {h.action}
                  {h.note ? ` · ${h.note}` : ''}
                </AppText>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                <Button label="Keep decision" size="md" variant="secondary" onPress={() => decide(a, false)} disabled={busy} />
                <Button label="Restore account" size="md" variant="trust" onPress={() => decide(a, true)} disabled={busy} />
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
