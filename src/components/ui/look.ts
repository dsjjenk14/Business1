import type { Theme } from '@/theme';

/** Shape switches for the current theme (the Guest List look is flat surfaces + ticket controls). */
export function look(t: Theme) {
  return {
    flat: t.style.surface === 'flat',
    ticket: t.style.controls === 'ticket',
    poster: t.style.section === 'poster',
  };
}

const DARK_TINTS = [
  ['#2E0F0F', '#FFA39B'],
  ['#2A2109', '#F2D683'],
  ['#0C2818', '#94EEBA'],
  ['#121C36', '#A9C6FF'],
  ['#26122B', '#E6B7F0'],
  ['#301A0F', '#F9B98A'],
] as const;
const LIGHT_TINTS = [
  ['#F8DCD8', '#8E1F17'],
  ['#F3E8C4', '#6B4E00'],
  ['#D5EFDF', '#0D5A33'],
  ['#DCE6FA', '#1E3F86'],
  ['#EEDDF3', '#5E2A70'],
  ['#F7E0CF', '#7A3A12'],
] as const;

/** A steady color pair for someone's initials, picked from their name. */
export function tintFor(t: Theme, name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const set = t.mode === 'dark' ? DARK_TINTS : LIGHT_TINTS;
  const [bg, fg] = set[h % set.length]!;
  return { bg, fg };
}
