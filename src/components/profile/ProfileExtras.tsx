import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Sheet, TextField, useToast } from '@/components/ui';
import { PROFILE_COLORS, profileAccent, profileStrength, setHeaderPhoto, setMood, setProfileColor, type ProfileColor } from '@/features/profiles/customize';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { friendlyError } from '@/lib/supabase';
import { useTheme } from '@/theme';

/** "Profile 62% · Add your song": a bar that shows what to add next. Only on your own profile. */
export function StrengthBar({ input, onFix }: { input: Parameters<typeof profileStrength>[0]; onFix?: (key: string) => void }) {
  const t = useTheme();
  const router = useRouter();
  const { percent, next } = profileStrength(input);
  if (!next) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your profile is ${percent}% done. Next: ${next.label}`}
      onPress={() => (onFix && next.href === '/profile' ? onFix(next.key) : router.push(next.href))}
      style={{ gap: 6, padding: t.space[3], borderRadius: t.radius.lg, backgroundColor: t.colors.surface }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="small" weight="bold">
          Profile {percent}%
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <AppText variant="small" tone="primary" weight="bold">
            {next.label}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={t.colors.primaryText} />
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${percent}%`, height: '100%', borderRadius: 3, backgroundColor: t.colors.primary }} />
      </View>
    </Pressable>
  );
}

/** Your header photo and profile color, in one sheet. */
export function HeaderSheet({
  visible,
  onClose,
  userId,
  hasHeader,
  color,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  hasHeader: boolean;
  color: string | null;
  onSaved: () => void;
}) {
  const t = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 1], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      await setHeaderPhoto(userId, asset.uri);
      toast('Header photo updated');
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await setHeaderPhoto(userId, null);
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickColor(c: ProfileColor) {
    haptic.select();
    try {
      await setProfileColor(userId, c);
      onSaved();
    } catch (e) {
      toast(friendlyError(e));
    }
  }

  return (
    <Sheet visible={visible} title="Make it yours" onClose={onClose}>
      <Button label={hasHeader ? 'Change header photo' : 'Add a header photo'} onPress={pick} loading={busy} />
      {hasHeader ? <Button label="Remove header photo" variant="secondary" onPress={remove} disabled={busy} /> : null}
      <AppText variant="small" weight="bold" tone="muted">
        Profile color
      </AppText>
      <View style={{ flexDirection: 'row', gap: t.space[4] }}>
        {PROFILE_COLORS.map((c) => {
          const on = (color ?? 'red') === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.label}
              onPress={() => pickColor(c.key)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: profileAccent(t, c.key),
                borderWidth: on ? 3 : 0,
                borderColor: t.colors.text,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {on ? <Ionicons name="checkmark" size={20} color={t.colors.bg} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** Change your mood right from your profile. */
export function MoodSheet({ visible, onClose, userId, mood, onSaved }: { visible: boolean; onClose: () => void; userId: string; mood: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(mood ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await setMood(userId, value);
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} title="Your mood" onClose={onClose}>
      <TextField label="Mood" value={value} onChangeText={setValue} maxLength={60} placeholder="ready for the weekend" autoFocus onSubmitEditing={save} />
      <Button label="Save" onPress={save} loading={busy} />
    </Sheet>
  );
}

/** On Home, for new members: nudge them to finish their profile until it's mostly done. */
export function HomeProfileNudge() {
  const { profile } = useAuth();
  if (!profile) return null;
  const { percent } = profileStrength(profile);
  if (percent >= 75) return null;
  return <StrengthBar input={profile} />;
}
