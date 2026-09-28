import { OPS } from '../data/apex';

/**
 * Scheduling happens in Lagos local time regardless of the viewer's timezone.
 * A day is an ISO date string ('2026-10-02'); a time is minutes from Lagos midnight.
 * Lagos has no DST, so a fixed offset is exact.
 */

const OFFSET_MS = OPS.utcOffsetMinutes * 60_000;
const DAY_MS = 86_400_000;

export interface LagosClock {
  date: string;
  minutes: number;
}

export function lagosClock(ms: number = Date.now()): LagosClock {
  const shifted = new Date(ms + OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Epoch ms for a Lagos date + minutes. */
export function lagosMs(date: string, minutes: number): number {
  return Date.parse(`${date}T00:00:00Z`) + minutes * 60_000 - OFFSET_MS;
}

export function toIso(date: string, minutes: number): string {
  return new Date(lagosMs(date, minutes)).toISOString();
}

export function fromIso(iso: string): LagosClock {
  return lagosClock(Date.parse(iso));
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = weekday(date);
  return d === 0 || d === 5 || d === 6;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function dayShort(date: string): string {
  return DAYS[weekday(date)];
}

export function dayLong(date: string): string {
  return DAYS_LONG[weekday(date)];
}

export function dateLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

export function relativeDayLabel(date: string, today: string = lagosClock().date): string {
  const diff = diffDays(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${dayLong(date)} ${dateLabel(date)}`;
}

export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHhmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export function isoTime(iso: string): string {
  return hhmm(fromIso(iso).minutes);
}
