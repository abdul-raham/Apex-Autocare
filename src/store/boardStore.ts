import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { repository, type BookingRecord, type RescheduleInput } from '../lib/repository';
import { dayAvailability, type SlotOption } from '../lib/scheduling';
import type { Booking, BookingEvent, CreateBookingInput, EventType, JobSpec } from '../lib/types';

/**
 * Persisted bookings + automation events, shared by the booking flow (for
 * availability) and /operations (for the day track). Refreshes itself when the
 * repository reports a change from another tab or another visitor.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface BoardState {
  status: Status;
  error: string | null;
  bookings: Booking[];
  events: BookingEvent[];
  lastSync: number | null;
  mode: 'local' | 'supabase';
  init: () => void;
  refresh: () => Promise<void>;
  upsert: (record: BookingRecord) => void;
  createBooking: (input: CreateBookingInput) => Promise<BookingRecord>;
  rescheduleBooking: (code: string, input: RescheduleInput) => Promise<BookingRecord>;
  cancelBooking: (code: string) => Promise<BookingRecord>;
  logEvent: (code: string, type: EventType, label: string, metadata?: Record<string, unknown>) => Promise<void>;
  resetDemo: () => Promise<void>;
}

let started = false;

export const useBoard = create<BoardState>()((set, get) => ({
  status: 'idle',
  error: null,
  bookings: [],
  events: [],
  lastSync: null,
  mode: repository.mode,

  init: () => {
    if (started) return;
    started = true;
    void get().refresh();
    repository.subscribe(() => void get().refresh());
    // Safety net if a realtime message is missed.
    setInterval(() => {
      if (document.visibilityState === 'visible') void get().refresh();
    }, 45_000);
  },

  refresh: async () => {
    if (get().status !== 'ready') set({ status: 'loading' });
    try {
      const data = await repository.loadBoard();
      set({ status: 'ready', error: null, bookings: data.bookings, events: data.events, lastSync: Date.now() });
    } catch (e) {
      set({ status: get().bookings.length ? 'ready' : 'error', error: (e as Error).message });
    }
  },

  upsert: ({ booking, events }) =>
    set((s) => ({
      bookings: [...s.bookings.filter((b) => b.id !== booking.id), booking],
      events: [...s.events.filter((e) => e.bookingId !== booking.id), ...events],
      lastSync: Date.now(),
    })),

  createBooking: async (input) => {
    const record = await repository.createBooking(input);
    get().upsert(record);
    return record;
  },

  rescheduleBooking: async (code, input) => {
    const record = await repository.rescheduleBooking(code, input);
    get().upsert(record);
    return record;
  },

  cancelBooking: async (code) => {
    const record = await repository.cancelBooking(code);
    get().upsert(record);
    return record;
  },

  logEvent: async (code, type, label, metadata) => {
    await repository.logEvent(code, type, label, metadata);
    await get().refresh();
  },

  resetDemo: async () => {
    await repository.resetDemo();
    await get().refresh();
  },
}));

/** Ensure the board is loading and return it. */
export function useBoardData() {
  const init = useBoard((s) => s.init);
  useEffect(() => init(), [init]);
  return useBoard();
}

/** Ticking clock for anything time-relative (stages, "past" slots). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useAvailability(date: string, spec: JobSpec, opts: { excludeBookingId?: string; preferredUnitId?: string } = {}) {
  const { bookings, status } = useBoardData();
  const now = useNow(60_000);
  const { excludeBookingId, preferredUnitId } = opts;
  const slots: SlotOption[] = useMemo(
    () => (spec.zoneId ? dayAvailability({ date, spec, bookings, now, excludeBookingId, preferredUnitId }) : []),
    [date, spec, bookings, now, excludeBookingId, preferredUnitId],
  );
  return { slots, status };
}
