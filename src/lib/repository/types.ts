import type { Booking, BookingEvent, CreateBookingInput, EventType } from '../types';

export interface BoardData {
  bookings: Booking[];
  events: BookingEvent[];
}

export interface BookingRecord {
  booking: Booking;
  events: BookingEvent[];
}

export interface RescheduleInput {
  date: string;
  startMinutes: number;
  /** Unit the client-side engine picked; the backend may reassign if it was just taken. */
  unitId: string;
}

/**
 * Persistence boundary. Components never talk to storage directly — they go
 * through the store, which goes through one of these. Both implementations run
 * the same feasibility rules before writing.
 */
export interface ApexRepository {
  readonly mode: 'local' | 'supabase';
  loadBoard(): Promise<BoardData>;
  getBooking(code: string): Promise<BookingRecord | null>;
  createBooking(input: CreateBookingInput): Promise<BookingRecord>;
  rescheduleBooking(code: string, input: RescheduleInput): Promise<BookingRecord>;
  cancelBooking(code: string): Promise<BookingRecord>;
  logEvent(code: string, type: EventType, label: string, metadata?: Record<string, unknown>): Promise<void>;
  resetDemo(): Promise<void>;
  /** Called whenever bookings/events change elsewhere (another tab, another judge). */
  subscribe(onChange: () => void): () => void;
}
