import type { Meetup, PersonLite } from '@/features/circles/api';
import { supabase } from '@/lib/supabase';

export type EventDetail = {
  id: number;
  title: string;
  emoji: string | null;
  description: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  is_recurring: boolean;
  host: PersonLite & { vouch_count: number };
  is_host: boolean;
  venue: { id: number; name: string; address: string | null; neighborhood: string | null } | null;
  place: string | null;
  group: { id: number; name: string; emoji: string } | null;
  i_am_going: boolean;
  /** The phone's GPS showed you at the event (marked automatically). */
  i_am_here: boolean;
  ticket_price_cents: number | null;
  has_ticket: boolean;
  /** Host only. */
  tickets_sold: number | null;
  /** Host only: payouts are set up, so a ticket price can be added. */
  host_can_sell: boolean | null;
  on_waitlist: boolean;
  waitlist_position: number | null;
  waitlist_count: number;
  going_count: number;
  going: (PersonLite & { degree: number })[];
  has_recap: boolean;
};

export async function fetchEvent(id: number) {
  const { data, error } = await supabase.rpc('event_detail', { p_event: id });
  if (error) throw error;
  return data as unknown as EventDetail | null;
}

export async function createEvent(input: {
  title: string;
  startsAt: Date;
  venueId?: number | null;
  glyph?: string;
  description?: string;
  capacity?: number | null;
  groupId?: number | null;
  durationHours?: number;
  place?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const { data, error } = await supabase.rpc('create_event', {
    p_title: input.title.trim(),
    p_starts_at: input.startsAt.toISOString(),
    p_venue_id: input.venueId ?? undefined,
    p_emoji: input.glyph || undefined,
    p_description: input.description?.trim() ?? '',
    p_capacity: input.capacity ?? undefined,
    p_group: input.groupId ?? undefined,
    p_duration_hours: input.durationHours ?? 3,
    p_place: input.place?.trim() || undefined,
    p_lat: input.lat ?? undefined,
    p_lng: input.lng ?? undefined,
  });
  if (error) throw error;
  return data as number;
}

/** Check in at an event (GPS). Returns the people you met there, same as a normal check-in. */
export async function eventCheckIn(eventId: number, coords: { lat: number; lng: number; accuracy: number | null }) {
  const { data, error } = await supabase.rpc('event_check_in', {
    p_event: eventId,
    p_lat: coords.lat,
    p_lng: coords.lng,
    p_accuracy_m: coords.accuracy ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as Meetup[];
}

export async function postRecap(eventId: number, body: string, tags: string[]) {
  const { data, error } = await supabase.rpc('post_recap', { p_event: eventId, p_body: body.trim(), p_tags: tags });
  if (error) throw error;
  return data as number;
}

/** Event state relative to now: before check-in opens, happening (check-in open), or over. */
export function eventPhase(e: Pick<EventDetail, 'starts_at' | 'ends_at'>, now = Date.now()): 'upcoming' | 'live' | 'ended' {
  const start = new Date(e.starts_at).getTime();
  const end = e.ends_at ? new Date(e.ends_at).getTime() : start + 3 * 3600_000;
  if (now < start - 3600_000) return 'upcoming';
  if (now <= end) return 'live';
  return 'ended';
}

/** Check-in is open from 1 hour before the start until 3 hours after the end. */
export function checkInOpen(e: Pick<EventDetail, 'starts_at' | 'ends_at'>, now = Date.now()) {
  const start = new Date(e.starts_at).getTime();
  const end = e.ends_at ? new Date(e.ends_at).getTime() : start + 3 * 3600_000;
  return now >= start - 3600_000 && now <= end + 3 * 3600_000;
}

/** Full event: get in line. When someone drops out, the first person in line gets the spot automatically. */
export async function joinWaitlist(eventId: number) {
  const { data, error } = await supabase.rpc('join_waitlist', { p_event: eventId });
  if (error) throw error;
  return data as number;
}

export async function leaveWaitlist(eventId: number) {
  const { error } = await supabase.rpc('leave_waitlist', { p_event: eventId });
  if (error) throw error;
}
