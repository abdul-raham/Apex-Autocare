import { create } from 'zustand';

export type TelemetryTone = 'info' | 'ok' | 'warn' | 'error';

export interface TelemetryMessage {
  id: number;
  channel: string;
  text: string;
  tone: TelemetryTone;
  at: number;
}

interface TelemetryState {
  messages: TelemetryMessage[];
  push: (text: string, opts?: { tone?: TelemetryTone; channel?: string }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useTelemetry = create<TelemetryState>()((set, get) => ({
  messages: [],
  push: (text, { tone = 'info', channel = 'SYS' } = {}) => {
    const id = ++seq;
    // Collapse identical consecutive readouts (e.g. rapid slider changes).
    const last = get().messages.at(-1);
    const rest = last && last.text === text ? get().messages.slice(0, -1) : get().messages;
    set({ messages: [...rest, { id, channel, text, tone, at: Date.now() }].slice(-4) });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 7000 : 4200);
  },
  dismiss: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
}));

export const telemetry = (text: string, opts?: { tone?: TelemetryTone; channel?: string }) => useTelemetry.getState().push(text, opts);
