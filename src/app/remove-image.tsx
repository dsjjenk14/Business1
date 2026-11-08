import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { submitTakedown, takedownStatus, type TakedownKind, type TakedownStatus } from '@/features/safety/takedown';
import { useAuth } from '@/lib/auth';
import { callNumber } from '@/lib/sms';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

const KINDS: { key: TakedownKind; label: string }[] = [
  { key: 'post', label: 'A post' },
  { key: 'out', label: 'An Out' },
  { key: 'profile_photo', label: 'A profile photo' },
  { key: 'other', label: 'Somewhere else' },
];

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Request removal of an intimate image shared without consent (TAKE IT DOWN Act).
 * Open to everyone, signed in or not. Opened from a post, an Out or a profile, it's already filled in.
 */
export default function RemoveImage() {
  const t = useTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ pin?: string; out?: string; poster?: string; kind?: TakedownKind; name?: string }>();
  const fromApp = !!(params.pin || params.out || params.poster);
  const [kind, setKind] = useState<TakedownKind | null>(params.kind ?? (params.pin ? 'post' : params.out ? 'out' : params.poster ? 'profile_photo' : null));
  const [forSelf, setForSelf] = useState(true);
  const [location, setLocation] = useState('');
  const [statement, setStatement] = useState('');
  const [contact, setContact] = useState(session?.user.email ?? '');
  const [signature, setSignature] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<TakedownStatus | null | undefined>(undefined);

  async function send() {
    if (!kind) return setError('Pick where the image is.');
    setBusy(true);
    setError(null);
    try {
      setCode(
        await submitTakedown({
          kind,
          statement,
          signature,
          contact,
          confirm,
          location,
          forSelf,
          pinId: params.pin ? Number(params.pin) : undefined,
          outId: params.out ? Number(params.out) : undefined,
          posterId: params.poster,
        }),
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    try {
      setFound(await takedownStatus(lookup));
    } catch {
      setFound(null);
    }
  }

  const help = (
    <Card style={{ gap: t.space[2] }}>
      <AppText weight="bold">Support, free and confidential</AppText>
      <AppText variant="small" tone="muted">
        The Cyber Civil Rights Initiative’s Image Abuse Helpline can help you get images taken down elsewhere online, 24/7.
      </AppText>
      <Button label="Call 844-878-2274" size="md" variant="secondary" onPress={() => callNumber('8448782274')} />
      <AppText variant="small" tone="muted">
        If you’re in danger, call 911. Sharing intimate images without consent is a crime under federal law and in most states, and you can report it
        to police.
      </AppText>
    </Card>
  );

  if (code)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <BackHeader title="Request sent" />
        <Screen>
          <AppText variant="h2" accessibilityRole="header">
            We got your request.
          </AppText>
          <Card accent="primary" style={{ gap: t.space[1] }}>
            <AppText variant="caption" tone="muted">
              Your confirmation number
            </AppText>
            <AppText variant="h1" selectable>
              {code}
            </AppText>
          </Card>
          <AppText tone="muted">
            Save this number. We’ll review your request and remove the image, and any copies we find, within 48 hours.
            {fromApp && session ? ' It’s already hidden while we review it.' : ''} We’ll contact you at {contact.trim()} if we need anything.
          </AppText>
          {help}
        </Screen>
      </View>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackHeader title="Remove an intimate image" />
      <Screen>
        <AppText tone="muted">
          If someone shared a nude or sexual photo or video of you on I’m In without your permission, including a fake or AI-made one, we’ll remove
          it within 48 hours. You don’t need an account to ask.
        </AppText>

        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">Who is in the image?</AppText>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Chip label="Me" selected={forSelf} onPress={() => setForSelf(true)} />
            <Chip label="Someone I’m authorized to act for" selected={!forSelf} onPress={() => setForSelf(false)} />
          </View>
        </View>

        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">Where is it?</AppText>
          {fromApp ? (
            <AppText tone="muted">
              {params.pin ? 'The post' : params.out ? 'The Out' : 'The profile photos'} from {params.name || 'this member'}.
            </AppText>
          ) : (
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {KINDS.map((k) => (
                <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
              ))}
            </View>
          )}
          <TextField
            label={fromApp ? 'Anything else that helps us find it' : 'Where to find it'}
            optional={fromApp}
            placeholder="Whose profile (their name), and when or where it was posted"
            value={location}
            onChangeText={setLocation}
            multiline
            maxLength={1000}
          />
        </View>

        <TextField
          label="Why it was shared without consent"
          hint="A sentence or two is enough. For example: I never agreed to this being shared."
          value={statement}
          onChangeText={setStatement}
          multiline
          maxLength={2000}
          style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <TextField label="Email or phone" hint="So we can reach you about this request." value={contact} onChangeText={setContact} maxLength={200} autoCapitalize="none" />
        <TextField label="Your signature" hint="Type your full name." value={signature} onChangeText={setSignature} maxLength={120} />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirm }}
          aria-checked={confirm}
          onPress={() => setConfirm((c) => !c)}
          style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
          <Ionicons name={confirm ? 'checkbox' : 'square-outline'} size={22} color={confirm ? t.colors.primary : t.colors.textSubtle} />
          <AppText variant="small" style={{ flex: 1 }}>
            I believe in good faith that this image was shared without the consent of the person shown, and that what I wrote here is true.
          </AppText>
        </Pressable>

        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Send request" variant="danger" onPress={send} loading={busy} disabled={!confirm} />

        {help}

        <View style={{ gap: t.space[2] }}>
          <AppText weight="bold">Already sent a request?</AppText>
          <TextField label="Confirmation number" value={lookup} onChangeText={setLookup} autoCapitalize="characters" maxLength={8} />
          <Button label="Check status" size="md" variant="secondary" onPress={check} disabled={lookup.trim().length < 8} />
          {found === null ? <AppText tone="muted">We couldn’t find that number.</AppText> : null}
          {found ? (
            <AppText tone="muted" accessibilityLiveRegion="polite">
              {found.status === 'removed'
                ? `Removed on ${when(found.decided_at ?? found.due_at)}.`
                : found.status === 'not_removed'
                  ? 'We reviewed it and couldn’t remove anything. Contact support if you can tell us more.'
                  : `We’re on it. We’ll decide by ${when(found.due_at)}.`}
            </AppText>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
