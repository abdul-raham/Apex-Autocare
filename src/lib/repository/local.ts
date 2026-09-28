import { OPS } from '../../data/apex';
import { cancellationEvents, creationEvents, customEvent, newId, rescheduleEvents, supersede } from '../automation';
import { buildBooking, normalizeCode, randomCode, retimeBooking, specOf } from '../bookings';
import { evaluateSlot } from '../scheduling';
import { generateSeed } from '../seed';
import { lagosClock } from '../time';
import { SlotConflictError, type Booking, type BookingEvent, type CreateBookingInput } from '../types';
import type { ApexRepository, BoardData, BookingRecord, RescheduleInput } from './types';

/**
 * Offline persistence for the showcase: localStorage + BroadcastChannel so a
 * booking made in one tab appears live in /operations in another. Used whenever
 * Supabase env vars are absent.
 */

const KEY = 'apex.demo.v1';
const CHANNEL = 'apex-demo';

interface Db {
  version: 1;
  seededFor: string;
  bookings: Booking[];
  events: BookingEvent[];
}

const latency = () => new Promise((r) => setTimeout(r, 280 + Math.random() * 220));

function read(): Db | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Db) : null;
  } catch {
    return null;
  }
}

/** Keep the seed rolling forward with the calendar without losing anything a visitor changed. */
function rollSeed(db: Db | null, today: string): Db {
  const seed = generateSeed(today);
  if (!db) return { version: 1, seededFor: today, ...seed };
  if (db.seededFor === today) return db;

  const existing = new Map(db.bookings.map((b) => [b.id, b]));
  const touched = (b: Booking) => b.updatedAt !== b.createdAt;
  const bookings: Booking[] = seed.bookings.map((s) => {
    const prior = existing.get(s.id);
    return prior && touched(prior) ? prior : s;
  });
  const seedIds = new Set(seed.bookings.map((b) => b.id));
  bookings.push(...db.bookings.filter((b) => b.source === 'web' && !seedIds.has(b.id)));

  const kept = new Set(bookings.filter((b) => existing.get(b.id) === b).map((b) => b.id));
  const events = [
    ...db.events.filter((e) => kept.has(e.bookingId)),
    ...seed.events.filter((e) => !kept.has(e.bookingId)),
  ];
  return { version: 1, seededFor: today, bookings, events };
}

export class LocalRepository implements ApexRepository {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  private memory: Db | null = null;

  private load(): Db {
    const db = rollSeed(read() ?? this.memory, lagosClock().date);
    this.write(db, false);
    return db;
  }

  private write(db: Db, notify = true) {
    this.memory = db;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* private mode: stay in memory */
    }
    if (notify) this.channel?.postMessage('changed');
  }

  private record(db: Db, booking: Booking): BookingRecord {
    return { booking, events: db.events.filter((e) => e.bookingId === booking.id) };
  }

  private find(db: Db, code: string) {
    const c = normalizeCode(code);
    return db.bookings.find((b) => b.code === c) ?? null;
  }

  async loadBoard(): Promise<BoardData> {
    await latency();
    const db = this.load();
    return { bookings: db.bookings, events: db.events };
  }

  async getBooking(code: string) {
    await latency();
    const db = this.load();
    const b = this.find(db, code);
    return b ? this.record(db, b) : null;
  }

  async createBooking(input: CreateBookingInput) {
    await latency();
    const db = this.load();
    // Re-run feasibility against the freshest state — another tab may have just booked.
    const slot = evaluateSlot({ date: input.date, spec: input.spec, bookings: db.bookings, start: input.startMinutes, preferredUnitId: input.unitId });
    if (slot.status !== 'available' || !slot.unitId) throw new SlotConflictError(slot.reason);
    const unitId = slot.freeUnitIds.includes(input.unitId) ? input.unitId : slot.unitId;

    const booking = buildBooking({ ...input, unitId }, { id: newId('bk'), code: randomCode(), source: 'web', createdAt: new Date().toISOString() });
    const events = creationEvents(booking);
    this.write({ ...db, bookings: [...db.bookings, booking], events: [...db.events, ...events] });
    return { booking, events };
  }

  async rescheduleBooking(code: string, input: RescheduleInput) {
    await latency();
    const db = this.load();
    const before = this.find(db, code);
    if (!before) throw new Error('Booking not found.');
    if (before.status === 'cancelled') throw new Error('This booking was cancelled.');

    const slot = evaluateSlot({
      date: input.date,
      spec: specOf(before),
      bookings: db.bookings,
      start: input.startMinutes,
      excludeBookingId: before.id,
      preferredUnitId: input.unitId,
    });
    if (slot.status !== 'available' || !slot.unitId) throw new SlotConflictError(slot.reason);
    const unitId = slot.freeUnitIds.includes(input.unitId) ? input.unitId : slot.unitId;

    const at = new Date().toISOString();
    const after = retimeBooking(before, input.date, input.startMinutes, unitId, at);
    const events = [...supersede(db.events, before.id, at), ...rescheduleEvents(before, after, at)];
    const next = { ...db, bookings: db.bookings.map((b) => (b.id === before.id ? after : b)), events };
    this.write(next);
    return this.record(next, after);
  }

  async cancelBooking(code: string) {
    await latency();
    const db = this.load();
    const before = this.find(db, code);
    if (!before) throw new Error('Booking not found.');
    const at = new Date().toISOString();
    const late = Date.parse(before.startAt) - Date.now() < OPS.freeChangeHours * 3_600_000;
    const after: Booking = {
      ...before,
      status: 'cancelled',
      paymentStatus: late ? before.paymentStatus : 'refunded',
      updatedAt: at,
    };
    const events = [...supersede(db.events, before.id, at), ...cancellationEvents(after, at, late)];
    const next = { ...db, bookings: db.bookings.map((b) => (b.id === before.id ? after : b)), events };
    this.write(next);
    return this.record(next, after);
  }

  async logEvent(code: string, type: BookingEvent['type'], label: string, metadata?: Record<string, unknown>) {
    await latency();
    const db = this.load();
    const b = this.find(db, code);
    if (!b) throw new Error('Booking not found.');
    this.write({ ...db, events: [...db.events, customEvent(b, type, label, new Date().toISOString(), metadata)] });
  }

  async resetDemo() {
    await latency();
    // Everything in the local store is demo data by construction; restore canonical seed.
    const today = lagosClock().date;
    this.write({ version: 1, seededFor: today, ...generateSeed(today) });
  }

  subscribe(onChange: () => void) {
    const onMessage = () => onChange();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) onChange();
    };
    this.channel?.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      this.channel?.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }
}
