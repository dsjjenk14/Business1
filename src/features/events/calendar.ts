import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { WEB_URL } from '@/lib/webUrl';

type CalendarEvent = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  description?: string;
  place?: string | null;
  venue?: { name: string; address: string | null } | null;
};

function where(e: CalendarEvent) {
  if (e.venue) return [e.venue.name, e.venue.address].filter(Boolean).join(', ');
  return e.place ?? '';
}

function endOf(e: CalendarEvent) {
  return e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 3 * 3600_000);
}

/** 20260929T230000Z */
function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
}

/**
 * Add an event to the phone's calendar. On a phone this opens the calendar's
 * own "New Event" screen, filled in, so you can save it (nothing is added
 * without you tapping Add). On the web it downloads a calendar file.
 * Returns false if you backed out.
 */
export async function addToCalendar(e: CalendarEvent) {
  const link = `${WEB_URL}/events/${e.id}`;
  const notes = [e.description?.trim(), `On I'm In: ${link}`].filter(Boolean).join('\n\n');

  if (Platform.OS === 'web') {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//I\'m In//EN',
      'BEGIN:VEVENT',
      `UID:imin-event-${e.id}`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(new Date(e.starts_at))}`,
      `DTEND:${icsDate(endOf(e))}`,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText(where(e))}`,
      `DESCRIPTION:${icsText(notes)}`,
      `URL:${link}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'event.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }

  const result = await Calendar.createEventInCalendarAsync({
    title: e.title,
    startDate: new Date(e.starts_at),
    endDate: endOf(e),
    location: where(e) || undefined,
    notes,
    url: link,
  });
  return result.action !== 'canceled';
}
