import { supabase } from '@/lib/supabase';
import type { Theme } from '@/theme/tokens';

import { uploadProfilePhoto } from './photos';

export type ProfileColor = 'red' | 'gold' | 'green' | 'blue';
export const PROFILE_COLORS: { key: ProfileColor; label: string }[] = [
  { key: 'red', label: 'Red' },
  { key: 'gold', label: 'Gold' },
  { key: 'green', label: 'Green' },
  { key: 'blue', label: 'Blue' },
];

/** The theme color a profile color stands for. Red is the default. */
export function profileAccent(t: Theme, color: string | null | undefined): string {
  return color === 'gold' ? t.colors.secondary : color === 'green' ? t.colors.trust : color === 'blue' ? t.colors.ai : t.colors.primary;
}

export async function setProfileColor(userId: string, color: ProfileColor) {
  const { error } = await supabase.from('profiles').update({ profile_color: color }).eq('id', userId);
  if (error) throw error;
}

export async function setMood(userId: string, mood: string) {
  const { error } = await supabase.from('profiles').update({ mood: mood.trim() || null }).eq('id', userId);
  if (error) throw error;
}

/** Upload a header photo and put it on your profile. Pass null to remove it. */
export async function setHeaderPhoto(userId: string, uri: string | null) {
  const url = uri ? await uploadProfilePhoto(userId, uri) : null;
  const { error } = await supabase.rpc('set_profile_header', { p_url: url ?? '' });
  if (error) throw error;
  return url;
}

type StrengthInput = {
  avatar_url?: string | null;
  header_url?: string | null;
  mood?: string | null;
  song?: unknown;
  prompts?: unknown;
  interests?: unknown;
  bio?: string | null;
  headline?: string | null;
};

export type StrengthStep = { key: string; label: string; done: boolean; href: '/settings/photos' | '/settings/profile' | '/profile' };

/** How finished a profile is, and what to add next. */
export function profileStrength(p: StrengthInput) {
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const steps: StrengthStep[] = [
    { key: 'photo', label: 'Add a photo', done: !!p.avatar_url, href: '/settings/photos' },
    { key: 'mood', label: 'Add your mood', done: !!p.mood?.trim(), href: '/profile' },
    { key: 'song', label: 'Add your song', done: !!p.song, href: '/settings/profile' },
    { key: 'prompts', label: 'Answer a prompt', done: count(p.prompts) > 0, href: '/settings/profile' },
    { key: 'interests', label: 'Pick 3 interests', done: count(p.interests) >= 3, href: '/settings/profile' },
    { key: 'header', label: 'Add a header photo', done: !!p.header_url, href: '/profile' },
    { key: 'headline', label: 'Add a headline', done: !!p.headline?.trim(), href: '/settings/profile' },
    { key: 'bio', label: 'Write a little about you', done: !!p.bio?.trim(), href: '/settings/profile' },
  ];
  const done = steps.filter((s) => s.done).length;
  return { percent: Math.round((done / steps.length) * 100), next: steps.find((s) => !s.done) ?? null, steps };
}
