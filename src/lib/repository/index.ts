import { LocalRepository } from './local';
import { SupabaseRepository } from './supabase';
import type { ApexRepository } from './types';

export type { ApexRepository, BoardData, BookingRecord, RescheduleInput } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const repository: ApexRepository = url && key ? new SupabaseRepository(url, key) : new LocalRepository();
