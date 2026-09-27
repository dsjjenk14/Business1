import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type Fn = Database['public']['Functions'];
export type Meetup = Fn['my_recent_meetups']['Returns'][number];
export type Activity = Fn['network_activity']['Returns'][number];
export type SearchResult = Fn['search_members']['Returns'][number];

export type PersonLite = { id: string; display_name: string; avatar_emoji: string | null; avatar_url: string | null };

export type CircleOverview = {
  first: (PersonLite & {
    vouch_count: number | null;
    top_vouch_word: string | null;
    city: string | null;
    neighborhood: string | null;
    out_tonight: boolean;
    source: string | null;
  })[];
  second: (PersonLite & {
    vouch_count: number | null;
    top_vouch_word: string | null;
    headline: string;
    via: { id: string; display_name: string }[];
    shared_groups: number;
    requested: boolean;
    score: number;
  })[];
  vouches_left: number;
  vouch_count: number;
};

export type GroupRow = {
  id: number;
  name: string;
  emoji: string;
  category: string;
  description: string;
  join_type: 'open' | 'request';
  schedule_label: string | null;
  member_count: number;
  is_member: boolean;
  requested: boolean;
  circle_members: string[] | null;
  owner_name: string;
};
export type GroupsOverview = { mine: GroupRow[]; from_circle: GroupRow[]; discover: GroupRow[] };

export type MyIntros = {
  to_answer: {
    id: number;
    message: string;
    created_at: string;
    connector: PersonLite;
    other: PersonLite & { headline: string; vouch_count: number | null };
  }[];
  requests: { id: number; note: string | null; created_at: string; requester: PersonLite; target: PersonLite }[];
  made_count: number;
};

const unwrap = <T,>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

export const fetchCircle = async () => unwrap<CircleOverview>(await supabase.rpc('circle_overview'));
export const fetchActivity = async () => unwrap<Activity[]>(await supabase.rpc('network_activity', { p_limit: 20 }));
export const fetchGroups = async () => unwrap<GroupsOverview>(await supabase.rpc('groups_overview'));
export const fetchIntros = async () => unwrap<MyIntros>(await supabase.rpc('my_intros'));
export const fetchMeetups = async () => unwrap<Meetup[]>(await supabase.rpc('my_recent_meetups', {}));
export const searchMembers = async (q: string) => unwrap<SearchResult[]>(await supabase.rpc('search_members', { p_query: q, p_limit: 20 }));

export async function fetchVouchWords() {
  const { data, error } = await supabase.from('vouch_words').select('id, word').eq('active', true).order('sort');
  if (error) throw error;
  return data ?? [];
}

/** A precise GPS reading for check-in. Never shown to anyone; the server keeps it private and deletes it after 30 days. */
export async function preciseLocation() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location is off. Check-in needs it to confirm you met in person.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
}

export async function checkIn() {
  const loc = await preciseLocation();
  return unwrap<Meetup[]>(await supabase.rpc('check_in', { p_lat: loc.lat, p_lng: loc.lng, p_accuracy_m: loc.accuracy ?? undefined }));
}

export async function giveVouch(voucherId: string, voucheeId: string, wordId: number, encounterId: number) {
  const { error } = await supabase
    .from('vouches')
    .insert({ voucher_id: voucherId, vouchee_id: voucheeId, type: 'gps', word_id: wordId, encounter_id: encounterId });
  if (error) throw error;
}

export const requestVouch = async (target: string) => unwrap<number>(await supabase.rpc('request_vouch', { p_target: target }));
export const makeIntro = async (a: string, b: string, message: string, requestId?: number) =>
  unwrap<number>(await supabase.rpc('make_intro', { p_a: a, p_b: b, p_message: message, p_request: requestId }));
export const respondIntro = async (id: number, accept: boolean) => unwrap<string>(await supabase.rpc('respond_intro', { p_intro: id, p_accept: accept }));
export const requestIntro = async (target: string, via: string, note: string) =>
  unwrap<number>(await supabase.rpc('request_intro', { p_target: target, p_via: via, p_note: note }));
export const declineIntroRequest = async (id: number) => unwrap<null>(await supabase.rpc('decline_intro_request', { p_request: id }));

