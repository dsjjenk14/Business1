import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { AppText, Avatar, Button, Card, Screen, TextField } from '@/components/ui';
import { useAppConfig } from '@/config/useAppConfig';
import { formatUSPhone, normalizeUSPhone } from '@/features/auth/phone';
import { ageFrom, signUp, toIsoDate } from '@/features/auth/signUp';
import { friendlyError, supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { goBackOr } from '@/lib/navigation';

type Errors = Partial<Record<'fullName' | 'phone' | 'email' | 'city' | 'dob' | 'password' | 'invite' | 'terms' | 'form', string>>;

const MIN_PASSWORD = 8;

export default function SignUp() {
  const t = useTheme();
  const router = useRouter();
  const { cities, settings } = useAppConfig();
  const minAge = Number(settings.min_age ?? 18);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [citySlug, setCitySlug] = useState<string | null>(null);
  const [mm, setMm] = useState('');
  const [dd, setDd] = useState('');
  const [yyyy, setYyyy] = useState('');
  const [password, setPassword] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState('');
  // Result of the last invite-code lookup: which code was checked and who it belongs to.
  const [inviteLookup, setInviteLookup] = useState<{ code: string; name: string | null } | null>(null);
  const inviter = inviteLookup && inviteLookup.code === invite.trim() ? inviteLookup.name : null;
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const clearError = (key: keyof Errors) => setErrors((e) => (e[key] || e.form ? { ...e, [key]: undefined, form: undefined } : e));

  const ddRef = useRef<TextInput>(null);
  const yyyyRef = useRef<TextInput>(null);

  // Live invite-code check: "Alex R. invited you ✓"
  useEffect(() => {
    const code = invite.trim();
    if (code.length < 6) return;
    const handle = setTimeout(async () => {
      const { data } = await supabase.rpc('check_invite_code', { p_code: code });
      setInviteLookup({ code, name: data ?? null });
      setErrors((e) => ({ ...e, invite: data ? undefined : "That code doesn't match anyone. Double-check it, or leave it blank." }));
    }, 350);
    return () => clearTimeout(handle);
  }, [invite]);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function validate(): { ok: false } | { ok: true; phoneE164: string; birthdate: string } {
    const next: Errors = {};
    if (fullName.trim().split(/\s+/).length < 2) next.fullName = 'Enter your first and last name.';
    const phoneE164 = normalizeUSPhone(phone);
    if (!phoneE164) next.phone = 'Enter a 10-digit US phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!citySlug) next.city = 'Pick the city closest to you.';
    const birthdate = toIsoDate(mm, dd, yyyy);
    if (!birthdate) next.dob = 'Enter your date of birth as MM / DD / YYYY.';
    else if (ageFrom(birthdate) < minAge) next.dob = `You must be ${minAge} or older to join I'm In.`;
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (!agreed) next.terms = 'Please agree to the Terms and Community Guidelines to join.';
    if (invite.trim() && !inviter) next.invite = "That code doesn't match anyone. Double-check it, or leave it blank.";
    setErrors(next);
    if (Object.values(next).some(Boolean) || !phoneE164 || !birthdate) return { ok: false };
    return { ok: true, phoneE164, birthdate };
  }

  async function onSubmit() {
    const v = validate();
    if (!v.ok) return;
    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp({
        fullName,
        phone: v.phoneE164,
        email,
        citySlug: citySlug!,
        birthdate: v.birthdate,
        password,
        inviteCode: invite.trim() || undefined,
        photoUri,
      });
      if (needsEmailConfirmation) setCheckEmail(true);
      // Otherwise the root navigator moves into the app on its own.
    } catch (e) {
      setErrors({ form: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <Screen safeTop>
        <AppText variant="h1" accessibilityRole="header">
          Check your email
        </AppText>
        <AppText tone="muted">We sent a confirmation link to {email.trim()}. Tap it, then come back and log in.</AppText>
        <Button label="Go to Log In" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen safeTop contentGap={t.space[5]}>
        <Pressable accessibilityRole="button" onPress={() => goBackOr(router, '/')} hitSlop={12}>
          <AppText tone="muted">← Back</AppText>
        </Pressable>

        <View style={{ gap: t.space[2] }}>
          <AppText variant="h1" accessibilityRole="header">
            Join I&apos;m In
          </AppText>
          <AppText tone="muted">Build your circle of real friends. Free to join. The more you show up, the more unlocks.</AppText>
        </View>

        <TextField label="Full name" value={fullName} onChangeText={(v) => { setFullName(v); clearError('fullName'); }} autoComplete="name" textContentType="name" autoCapitalize="words" error={errors.fullName} />
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={(v) => {
            setPhone(formatUSPhone(v));
            clearError('phone');
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="(202) 555-0100"
          error={errors.phone}
          hint="We'll text you a code to verify it."
        />
        <TextField
          label="Email address"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clearError('email');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />

        <View style={{ gap: t.space[2] }}>
          <AppText variant="small" weight="medium" tone="muted">
            Your city
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }} accessibilityRole="radiogroup">
            {cities.map((c) => {
              const selected = c.slug === citySlug;
              return (
                <Pressable
                  key={c.slug}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  onPress={() => {
                    setCitySlug(c.slug);
                    clearError('city');
                  }}
                  style={{
                    paddingHorizontal: t.space[3],
                    paddingVertical: t.space[2],
                    minHeight: 40,
                    justifyContent: 'center',
                    borderRadius: t.radius.pill,
                    borderWidth: t.borderWidth.regular,
                    borderColor: selected ? t.colors.primary : t.colors.border,
                    backgroundColor: selected ? t.colors.primary : t.colors.surfaceAlt,
                  }}>
                  <AppText variant="small" weight="bold" style={{ color: selected ? t.colors.onPrimary : t.colors.text }}>
                    {c.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {errors.city ? (
            <AppText variant="small" tone="danger">
              {errors.city}
            </AppText>
          ) : null}
        </View>

        <View style={{ gap: t.space[1] + 2 }}>
          <AppText variant="small" weight="medium" tone="muted">
            Date of birth
          </AppText>
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            {[
              { value: mm, set: setMm, placeholder: 'MM', len: 2, next: ddRef, label: 'Birth month' },
              { value: dd, set: setDd, placeholder: 'DD', len: 2, next: yyyyRef, ref: ddRef, label: 'Birth day' },
              { value: yyyy, set: setYyyy, placeholder: 'YYYY', len: 4, ref: yyyyRef, label: 'Birth year' },
            ].map((f) => (
              <TextInput
                key={f.placeholder}
                ref={f.ref}
                accessibilityLabel={f.label}
                value={f.value}
                onChangeText={(v) => {
                  const clean = v.replace(/\D/g, '').slice(0, f.len);
                  f.set(clean);
                  clearError('dob');
                  if (clean.length === f.len) f.next?.current?.focus();
                }}
                placeholder={f.placeholder}
                placeholderTextColor={t.colors.textSubtle}
                keyboardType="number-pad"
                maxLength={f.len}
                style={{
                  flex: f.len === 4 ? 1.4 : 1,
                  flexBasis: 0,
                  minWidth: 0,
                  minHeight: 50,
                  textAlign: 'center',
                  color: t.colors.text,
                  fontFamily: t.fonts.body,
                  fontSize: 16,
                  backgroundColor: t.colors.surfaceAlt,
                  borderWidth: t.borderWidth.regular,
                  borderColor: errors.dob ? t.colors.danger : t.colors.border,
                  borderRadius: t.radius.md,
                }}
              />
            ))}
          </View>
          <AppText variant="small" tone={errors.dob ? 'danger' : 'subtle'}>
            {errors.dob ?? `You must be ${minAge}+. Your birthday stays private.`}
          </AppText>
        </View>

        <TextField
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clearError('password');
          }}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />

        {inviteOpen ? (
          <TextField
            label="Invite code"
            optional
            value={invite}
            onChangeText={(v) => {
              setInvite(v.toUpperCase());
              clearError('invite');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            error={errors.invite}
            success={inviter ? `${inviter} invited you ✓  You'll be connected and both get a vouch.` : null}
            hint="If someone gave you a code, it connects you to them automatically and gives you both a vouch."
          />
        ) : (
          <Card onPress={() => setInviteOpen(true)} accessibilityLabel="Add an invite code, optional">
            <AppText weight="bold">Have an invite code?</AppText>
            <AppText variant="small" tone="muted">
              Optional. Anyone can join. A code connects you to the person who invited you.
            </AppText>
          </Card>
        )}

        <Card onPress={pickPhoto} accessibilityLabel={photoUri ? 'Change profile photo' : 'Add a profile photo, optional'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <Avatar name={fullName || 'You'} uri={photoUri} size={52} />
            <View style={{ flex: 1 }}>
              <AppText weight="bold">{photoUri ? 'Looking good' : 'Add a profile photo'}</AppText>
              <AppText variant="small" tone="muted">
                Optional. Members with photos get more connections.
              </AppText>
            </View>
          </View>
        </Card>

        {errors.form ? (
          <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {errors.form}
          </AppText>
        ) : null}
        {Object.entries(errors).some(([k, v]) => k !== 'form' && v) ? (
          <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
            Fix the highlighted fields above.
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          aria-checked={agreed}
          accessibilityLabel="I agree to the Terms of Service and Community Guidelines and I've read the Privacy Policy"
          onPress={() => {
            setAgreed((a) => !a);
            clearError('terms');
          }}
          style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={24} color={agreed ? t.colors.primary : errors.terms ? t.colors.danger : t.colors.textMuted} />
          <AppText variant="small" tone="muted" style={{ flex: 1 }}>
            I agree to the{' '}
            <AppText variant="small" tone="primary" weight="bold" onPress={() => router.push('/legal/terms')}>
              Terms of Service
            </AppText>{' '}
            and{' '}
            <AppText variant="small" tone="primary" weight="bold" onPress={() => router.push('/legal/guidelines')}>
              Community Guidelines
            </AppText>
            , and I&apos;ve read the{' '}
            <AppText variant="small" tone="primary" weight="bold" onPress={() => router.push('/legal/privacy')}>
              Privacy Policy
            </AppText>
            . I understand there&apos;s zero tolerance for abusive behavior.
          </AppText>
        </Pressable>
        {errors.terms ? (
          <AppText variant="small" tone="danger">
            {errors.terms}
          </AppText>
        ) : null}

        <Button label="Create Account" onPress={onSubmit} loading={busy} />
        <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={{ alignSelf: 'center' }} hitSlop={10}>
          <AppText tone="muted">
            Already have an account? <AppText tone="primary" weight="bold">Log In</AppText>
          </AppText>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
