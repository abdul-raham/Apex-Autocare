import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { OPS, UNITS } from '../../data/apex';
import { effectiveStatus } from '../../lib/automation';
import { naira, serviceById, zoneById } from '../../lib/catalog';
import { blocksCapacity, bookingSegments, isPeak, stageAt, unitUtilization, type JobStage } from '../../lib/scheduling';
import { addDays, dayShort, dateLabel, hhmm, lagosClock, lagosMs, relativeDayLabel } from '../../lib/time';
import type { Booking, BookingEvent } from '../../lib/types';
import { useApexPass } from '../../motion/ApexPass';
import { useBoard, useNow } from '../../store/boardStore';
import { telemetry } from '../../store/telemetryStore';
import { AutomationPulse } from './AutomationPulse';
import { UnitCapacityStrip } from './UnitCapacityStrip';

const SPAN = OPS.dispatchEnd - OPS.dispatchStart;
const pct = (m: number) => ((m - OPS.dispatchStart) / SPAN) * 100;

const COLUMNS: { id: JobStage | 'queued'; label: string }[] = [
  { id: 'queued', label: 'Queued' },
  { id: 'travel', label: 'Travel' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'detailing', label: 'Detailing' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'complete', label: 'Complete' },
];

const SEG_CLS = {
  travel: 'hatch bg-panel-2',
  setup: 'bg-silver/30',
  detail: 'bg-bone/85',
  inspection: 'bg-acid/60',
  return: 'hatch bg-panel-2',
} as const;

interface Exception {
  id: string;
  tone: 'warn' | 'info';
  title: string;
  body: string;
  action?: { label: string; run: () => Promise<void> };
}

/**
 * The owner's day, visual first: three unit lanes on a live clock, jobs flowing
 * through Travel → Arrived → Detailing → Inspection → Complete, every automated
 * action streaming alongside, and only genuine exceptions asking for attention.
 * Reads persisted bookings and events — no separate owner dataset.
 */
export function OwnerCommandSurface() {
  const { bookings, events, status, error, mode, lastSync, refresh, logEvent } = useBoard();
  const { go } = useApexPass();
  const now = useNow(15_000);
  const today = lagosClock(now).date;
  const [date, setDate] = useState(today);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const liveMinutes = lagosClock(now).minutes;
  const defaultMinutes = date === today ? Math.min(Math.max(liveMinutes, OPS.dispatchStart), OPS.dispatchEnd) : date < today ? OPS.dispatchEnd : OPS.dispatchStart;
  const minutes = scrub ?? defaultMinutes;
  const at = lagosMs(date, minutes);
  const isLive = scrub === null && date === today && liveMinutes >= OPS.dispatchStart && liveMinutes <= OPS.dispatchEnd;

  useEffect(() => setScrub(null), [date]);

  // Replay the day at 60× real time.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setScrub((s) => {
        const next = (s ?? OPS.dispatchStart) + 2;
        if (next >= OPS.dispatchEnd) {
          setPlaying(false);
          return OPS.dispatchEnd;
        }
        return next;
      });
    }, 33);
    return () => clearInterval(id);
  }, [playing]);

  const dayJobs = useMemo(
    () => bookings.filter((b) => blocksCapacity(b) && lagosClock(Date.parse(b.startAt)).date === date).sort((a, z) => a.startAt.localeCompare(z.startAt)),
    [bookings, date],
  );
  const dayIds = new Set(dayJobs.map((b) => b.id));

  const stats = useMemo(() => {
    const weekAgo = now - 7 * 86_400_000;
    const auto = events.filter((e) => effectiveStatus(e, now) === 'completed' && Date.parse(e.completedAt ?? e.scheduledFor ?? e.createdAt) >= weekAgo);
    const revenue = dayJobs.reduce((s, b) => s + b.subtotal, 0);
    const crewHours = dayJobs.reduce((s, b) => s + (Date.parse(b.occupiedEnd) - Date.parse(b.occupiedStart)) / 3_600_000, 0);
    return { auto: auto.length, revenue, crewHours, jobs: dayJobs.length, saved: Math.round((auto.length * 3.5) / 60) };
  }, [events, dayJobs, now]);

  const exceptions: Exception[] = useMemo(() => {
    const list: Exception[] = [];
    for (const b of dayJobs) {
      if (b.paymentStatus === 'pending') {
        const nudged = events.some((e) => e.bookingId === b.id && e.type === 'deposit_nudge');
        list.push({
          id: `dep-${b.id}`,
          tone: 'warn',
          title: `Deposit pending · ${b.code}`,
          body: `${b.customerName}'s ${b.vehicleLabel} at ${hhmm(lagosClock(Date.parse(b.startAt)).minutes)} is held but unpaid. ${nudged ? 'Nudge already sent — hold auto-releases 12h before arrival.' : 'Hold auto-releases 12h before arrival.'}`,
          action: nudged
            ? undefined
            : {
                label: 'Send deposit nudge',
                run: async () => {
                  await logEvent(b.code, 'deposit_nudge', `Deposit reminder sent · ${naira(b.depositAmount)} (simulated)`);
                  telemetry(`Deposit nudge sent to ${b.customerName}`, { tone: 'ok', channel: 'OPS' });
                },
              },
        });
      }
      const moved = events.find((e) => e.bookingId === b.id && e.type === 'rescheduled');
      if (moved) {
        list.push({ id: `mv-${b.id}`, tone: 'info', title: `Rescheduled by customer · ${b.code}`, body: `${moved.label}. Calendar, crew brief and reminders were rebuilt automatically.` });
      }
      const start = lagosClock(Date.parse(b.startAt));
      if (isPeak(start.date, start.minutes) && ['victoria-island', 'ikoyi', 'ajah', 'sangotedo'].includes(b.zoneId)) {
        list.push({ id: `pk-${b.id}`, tone: 'info', title: `Rush-hour buffer · ${zoneById(b.zoneId)?.name}`, body: `${b.travelMinutes}m travel priced in each way for ${b.vehicleLabel} — no late arrival expected.` });
      }
    }
    for (const u of UNITS) {
      const util = unitUtilization(bookings, u.id, date);
      if (util > 0.85) list.push({ id: `ut-${u.id}`, tone: 'warn', title: `${u.name} at ${Math.round(util * 100)}%`, body: 'New requests are routed to the other units automatically.' });
    }
    return list;
  }, [dayJobs, events, bookings, date, logEvent]);

  const dayEvents: BookingEvent[] = events.filter((e) => dayIds.has(e.bookingId) || Date.parse(e.createdAt) > now - 6 * 3_600_000);
  const selectedJob = dayJobs.find((b) => b.id === selected) ?? null;

  const columnOf = (b: Booking): JobStage | 'queued' => {
    const s = stageAt(b, at).stage;
    if (s === 'scheduled') return 'queued';
    if (s === 'returning') return 'complete';
    return s;
  };

  return (
    <div className="grid gap-10 [&>*]:min-w-0">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="label mb-3 flex items-center gap-2">
            <span className="dot-live" /> {mode === 'supabase' ? 'Supabase realtime' : 'Local live sync'} · synced {lastSync ? hhmm(lagosClock(lastSync).minutes) : '—'}
          </div>
          <h1 className="display text-[clamp(52px,8vw,128px)] text-bone">
            Handled
            <br />
            automatically<span className="text-acid">.</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Day">
          {[-1, 0, 1, 2, 3, 4, 5].map((o) => {
            const d = addDays(today, o);
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === date}
                onClick={() => setDate(d)}
                className={`border px-3 py-2 text-left ${d === date ? 'border-acid bg-acid-soft' : 'border-line hover:border-line-strong'}`}
              >
                <span className={`label block !text-[9px] ${d === date ? '!text-acid' : ''}`}>{o === 0 ? 'Today' : o === -1 ? 'Yest.' : dayShort(d)}</span>
                <span className="mono text-[13px] text-bone">{d.slice(8)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* before / after proof */}
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Jobs on the day', String(stats.jobs), relativeDayLabel(date, today)],
          ['Automated actions · 7d', String(stats.auto), 'quotes, holds, confirmations, reminders'],
          ['Owner touches', '0', 'was ~14 messages + 2 calls per job'],
          ['Admin time saved · 7d', `${stats.saved}h`, '≈3.5 min per automated action'],
          ['Booked value', naira(stats.revenue), `${stats.crewHours.toFixed(1)} crew-hours committed`],
        ].map(([k, v, sub], i) => (
          <div key={k} className="bg-ink p-4">
            <div className="label !text-[9.5px]">{k}</div>
            <div className={`display-wide mt-2 text-[28px] leading-none ${i === 2 ? 'text-acid' : 'text-bone'}`}>{v}</div>
            <div className="mt-2 text-[12px] text-muted">{sub}</div>
          </div>
        ))}
      </div>

      <UnitCapacityStrip bookings={bookings} date={date} at={at} />

      {status === 'error' && (
        <div className="border border-tail/50 p-5" role="alert">
          <div className="label mb-1 !text-tail">Schedule unreachable</div>
          <p className="text-silver">{error} Showing nothing rather than stale data.</p>
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {/* day track */}
      <section aria-label="Day track" className="border border-line bg-panel p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="label">
            {dayShort(date)} {dateLabel(date)} · playhead <span className="mono !text-acid">{hhmm(minutes)}</span>
            {isLive && <span className="!text-acid"> · live</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaying((p) => !p)}>
              {playing ? '❚❚ Pause' : '▶ Replay day'}
            </button>
            {scrub !== null && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setScrub(null); setPlaying(false); }}>
                Back to live
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-none">
          <div className="relative min-w-[760px]">
            {/* hour ruler */}
            <div className="relative ml-[92px] h-5">
              {Array.from({ length: 13 }, (_, i) => OPS.dispatchStart + 60 * i).map((m) => (
                <span key={m} className="mono absolute -translate-x-1/2 text-[10px] text-muted" style={{ left: `${pct(m)}%` }}>
                  {hhmm(m)}
                </span>
              ))}
            </div>
            {UNITS.map((u) => (
              <div key={u.id} className="flex items-stretch border-t border-line">
                <div className="w-[92px] shrink-0 py-3 pr-3">
                  <div className="label !text-bone">{u.code}</div>
                  <div className="text-[11px] text-muted">{u.crew}</div>
                </div>
                <div className="relative h-[68px] flex-1">
                  {dayJobs
                    .filter((b) => b.unitId === u.id)
                    .map((b) => {
                      const segs = bookingSegments(b);
                      const from = segs[0].from;
                      const to = segs[4].to + OPS.turnaroundMinutes;
                      const { stage } = stageAt(b, at);
                      const active = stage !== 'scheduled' && stage !== 'complete';
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelected(b.id === selected ? null : b.id)}
                          aria-pressed={selected === b.id}
                          aria-label={`${b.code} ${b.vehicleLabel}, ${stage}`}
                          className={`absolute inset-y-2 flex overflow-hidden border text-left transition-shadow ${
                            selected === b.id ? 'border-acid shadow-[0_0_18px_rgba(201,255,61,.35)]' : active ? 'border-acid/60' : 'border-line-strong'
                          } ${stage === 'complete' ? 'opacity-45' : ''}`}
                          style={{ left: `${pct(from)}%`, width: `${((to - from) / SPAN) * 100}%` }}
                        >
                          {segs.map((s) => (
                            <span key={s.kind} className={`h-full ${SEG_CLS[s.kind]}`} style={{ width: `${(s.minutes / (to - from)) * 100}%` }} />
                          ))}
                          <span className="absolute inset-0 flex flex-col justify-center px-2">
                            <span className="truncate text-[11.5px] font-medium text-ink mix-blend-normal [text-shadow:0_0_6px_rgba(236,232,222,.6)]">{b.vehicleLabel}</span>
                            <span className="mono truncate text-[10px] text-ink/70">
                              {zoneById(b.zoneId)?.name.split(' / ')[0]} · {b.paymentStatus === 'pending' ? 'unpaid' : b.code}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
            {/* playhead */}
            <div className="pointer-events-none absolute bottom-0 top-5 ml-[92px]" style={{ left: 0, right: 0 }}>
              <div className="absolute inset-y-0 w-px bg-acid shadow-[0_0_12px_rgba(201,255,61,.9)]" style={{ left: `${pct(minutes)}%` }}>
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-acid" />
              </div>
            </div>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-4">
          <span className="label shrink-0">Scrub</span>
          <input
            type="range"
            min={OPS.dispatchStart}
            max={OPS.dispatchEnd}
            step={5}
            value={minutes}
            onChange={(e) => {
              setPlaying(false);
              setScrub(Number(e.target.value));
            }}
            className="w-full accent-[var(--color-acid)]"
            aria-valuetext={hhmm(minutes)}
          />
        </label>
      </section>

      {/* stage pipeline */}
      <section aria-label="Job stages">
        <div className="label mb-3">Jobs by stage at {hhmm(minutes)}</div>
        <LayoutGroup>
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {COLUMNS.map((c) => {
              const jobs = dayJobs.filter((b) => columnOf(b) === c.id);
              return (
                <div key={c.id} className="min-h-[150px] bg-ink p-3">
                  <div className={`label mb-3 flex justify-between ${jobs.length && c.id !== 'queued' && c.id !== 'complete' ? '!text-acid' : ''}`}>
                    {c.label} <span className="mono">{jobs.length}</span>
                  </div>
                  <div className="grid gap-1.5">
                    <AnimatePresence>
                      {jobs.map((b) => (
                        <motion.button
                          key={b.id}
                          layoutId={`job-${b.id}`}
                          type="button"
                          onClick={() => setSelected(b.id)}
                          className={`border p-2 text-left ${selected === b.id ? 'border-acid' : 'border-line-strong'} ${c.id === 'complete' ? 'opacity-50' : ''}`}
                          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                        >
                          <div className="truncate text-[12px] text-bone">{b.vehicleLabel}</div>
                          <div className="mono truncate text-[10px] text-muted">
                            {hhmm(lagosClock(Date.parse(b.startAt)).minutes)} · U{b.unitId.slice(-2)}
                          </div>
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* exceptions + selected job */}
        <div className="grid content-start gap-8">
          <section aria-label="Exceptions">
            <div className="label mb-3 flex justify-between">
              <span className="!text-bone">Needs a human</span>
              <span className="mono">{exceptions.filter((e) => e.tone === 'warn').length} open</span>
            </div>
            {exceptions.length === 0 ? (
              <div className="label border border-dashed border-line py-6 text-center">Nothing to handle — the day runs itself</div>
            ) : (
              <ul className="grid gap-2">
                {exceptions.map((x) => (
                  <li key={x.id} className={`border-l-2 bg-panel p-3 ${x.tone === 'warn' ? 'border-amber' : 'border-silver/50'}`}>
                    <div className={`label mb-1 ${x.tone === 'warn' ? '!text-amber' : '!text-silver'}`}>{x.title}</div>
                    <p className="text-[13px] text-silver">{x.body}</p>
                    {x.action && (
                      <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => void x.action!.run()}>
                        {x.action.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AnimatePresence mode="wait">
            {selectedJob && (
              <motion.section key={selectedJob.id} aria-label="Selected job" className="border border-acid/50 bg-panel p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="label mb-2 flex justify-between">
                  <span className="!text-acid">{selectedJob.code}</span>
                  <span>{stageAt(selectedJob, at).stage}</span>
                </div>
                <div className="display text-[34px] text-bone">{selectedJob.vehicleLabel}</div>
                <p className="mt-1 text-[13px] text-silver">
                  {selectedJob.customerName} · {serviceById(selectedJob.serviceId).name} · {zoneById(selectedJob.zoneId)?.name} · {naira(selectedJob.subtotal)}
                </p>
                <AutomationPulse className="mt-4" events={events.filter((e) => e.bookingId === selectedJob.id)} now={now} max={8} title="Automation for this job" />
                <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => go(`/manage/${selectedJob.code}`)}>
                  Open customer pass →
                </button>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <AutomationPulse events={dayEvents} now={now} max={16} showCode loading={status !== 'ready'} title="Automation stream" />
      </div>
    </div>
  );
}
