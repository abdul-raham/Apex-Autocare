import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeCode } from '../bookings';
import { toIso } from '../time';
import { BackendUnavailableError, SlotConflictError, type CreateBookingInput, type EventType } from '../types';
import type { ApexRepository, BoardData, BookingRecord, RescheduleInput } from './types';

/**
 * Supabase persistence. All writes go through SECURITY DEFINER RPCs defined in
 * supabase/schema.sql, which recompute price/duration from the catalogue tables and
 * rely on a Postgres exclusion constraint so two judges can never grab the same
 * unit window. The browser only ever holds the public anon key.
 */

interface RpcError {
  message: string;
  code?: string;
}

function mapError(error: RpcError): Error {
  if (error.code === '23P01' || /SLOT_CONFLICT/.test(error.message)) {
    return new SlotConflictError(error.message.replace(/^SLOT_CONFLICT:?\s*/, '') || undefined);
  }
  if (/Failed to fetch|NetworkError|fetch failed|timeout/i.test(error.message)) {
    return new BackendUnavailableError();
  }
  return new Error(error.message.replace(/^[A-Z_]+:\s*/, ''));
}

export class SupabaseRepository implements ApexRepository {
  readonly mode = 'supabase' as const;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: false } });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    let result;
    try {
      result = await this.client.rpc(fn, args);
    } catch (e) {
      throw new BackendUnavailableError((e as Error).message);
    }
    if (result.error) throw mapError(result.error);
    return result.data as T;
  }

  loadBoard() {
    return this.rpc<BoardData>('apex_board');
  }

  getBooking(code: string) {
    return this.rpc<BookingRecord | null>('apex_get_booking', { p_code: normalizeCode(code) });
  }

  createBooking(input: CreateBookingInput) {
    return this.rpc<BookingRecord>('apex_create_booking', {
      p: {
        classId: input.spec.classId,
        serviceId: input.spec.serviceId,
        addonIds: input.spec.addonIds,
        zoneId: input.spec.zoneId,
        startAt: toIso(input.date, input.startMinutes),
        unitId: input.unitId,
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email ?? null,
        address: input.customer.address,
        vehicleLabel: input.customer.vehicleLabel,
      },
    });
  }

  rescheduleBooking(code: string, input: RescheduleInput) {
    return this.rpc<BookingRecord>('apex_reschedule_booking', {
      p_code: normalizeCode(code),
      p_start_at: toIso(input.date, input.startMinutes),
      p_unit_id: input.unitId,
    });
  }

  cancelBooking(code: string) {
    return this.rpc<BookingRecord>('apex_cancel_booking', { p_code: normalizeCode(code) });
  }

  async logEvent(code: string, type: EventType, label: string, metadata?: Record<string, unknown>) {
    await this.rpc('apex_log_event', { p_code: normalizeCode(code), p_type: type, p_label: label, p_metadata: metadata ?? {} });
  }

  async resetDemo() {
    await this.rpc('apex_reset_demo');
  }

  subscribe(onChange: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A single booking writes a burst of events; coalesce them into one refresh.
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 250);
    };
    const channel = this.client
      .channel('apex-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_events' }, debounced)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void this.client.removeChannel(channel);
    };
  }
}
