import { motion } from 'framer-motion';
import { useState } from 'react';
import { OPS } from '../../data/apex';
import { addonById, naira, serviceById, unitById, vehicleById, zoneById } from '../../lib/catalog';
import { downloadIcs } from '../../lib/ics';
import { dayLong, dateLabel, duration, fromIso, hhmm, isoTime } from '../../lib/time';
import type { Booking } from '../../lib/types';
import { useApexPass } from '../../motion/ApexPass';

export interface ConfirmationPassProps {
  booking: Booking;
  /** Show the manage-booking action (hidden on the manage page itself). */
  showManage?: boolean;
  compact?: boolean;
}

const STATUS = {
  confirmed: { label: 'Confirmed', cls: 'bg-paper-ink text-acid' },
  pending_deposit: { label: 'Deposit pending', cls: 'bg-amber text-paper-ink' },
  cancelled: { label: 'Cancelled', cls: 'bg-tail text-paper-ink' },
} as const;

/** Barcode stripes derived from the booking code (decorative, deterministic). */
function Stripes({ code }: { code: string }) {
  const bars = Array.from(code.replace(/\W/g, '') + code.replace(/\W/g, '').split('').reverse().join('')).flatMap((c) => {
    const n = c.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 1) % 3)];
  });
  return (
    <div className="flex h-12 items-stretch gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className={i % 2 ? 'bg-transparent' : 'bg-paper-ink'} style={{ width: w * 1.5 }} />
      ))}
    </div>
  );
}

/**
 * The booking, rendered as an automotive appointment pass on warm paper: code,
 * vehicle, service, window, location, money and the manage action.
 */
export function ConfirmationPass({ booking: b, showManage = true, compact = false }: ConfirmationPassProps) {
  const { go } = useApexPass();
  const [copied, setCopied] = useState(false);
  const start = fromIso(b.startAt);
  const unit = unitById(b.unitId);
  const status = STATUS[b.status];
  const cancelled = b.status === 'cancelled';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; code is visible anyway */
    }
  };

  const fields: [string, string][] = [
    ['Vehicle', `${b.vehicleLabel} · ${vehicleById(b.classId).label}`],
    ['Service', [serviceById(b.serviceId).name, ...b.addonIds.map((a) => addonById(a)?.name ?? a)].join(' + ')],
    ['Date', `${dayLong(start.date)} ${dateLabel(start.date)}`],
    ['Arrival', `${hhmm(start.minutes)} ± 15 min · done ${isoTime(b.endAt)}`],
    ['Location', [b.address, zoneById(b.zoneId)?.name].filter(Boolean).join(' · ')],
    ['Unit', `${unit.name} · ${unit.crew}`],
  ];

  return (
    <article
      aria-label={`Appointment pass ${b.code}`}
      className={`relative overflow-hidden bg-paper text-paper-ink shadow-[0_40px_120px_rgba(0,0,0,.55)] ${compact ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_260px]'}`}
      style={{ borderRadius: 6 }}
    >
      <div className={`relative p-6 sm:p-9 ${cancelled ? 'opacity-70' : ''}`}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <span className="display-wide text-[15px] tracking-[0.08em]">
            APEX<span className="text-[#6f8f00]">°</span> · Appointment pass
          </span>
          <span className={`mono px-2 py-1 text-[10.5px] uppercase tracking-[0.14em] ${status.cls}`}>{status.label}</span>
        </header>

        <motion.h2
          className="display mt-6 text-[clamp(56px,9vw,120px)] leading-[0.82]"
          initial={{ letterSpacing: '0.04em', opacity: 0 }}
          animate={{ letterSpacing: '-0.012em', opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          {cancelled ? 'Cancelled.' : b.status === 'pending_deposit' ? 'Held.' : "You're booked."}
        </motion.h2>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="mono text-[clamp(22px,3vw,32px)] font-medium tracking-[0.08em]">{b.code}</span>
          <button type="button" onClick={copy} className="mono border border-paper-ink/30 px-2 py-1 text-[10.5px] uppercase tracking-[0.12em] hover:border-paper-ink">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <dl className="mt-7 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="border-t border-paper-ink/15 pt-2">
              <dt className="mono text-[10px] uppercase tracking-[0.16em] text-paper-ink/55">{k}</dt>
              <dd className="mt-0.5 text-[15px] font-medium leading-snug">{v || '—'}</dd>
            </div>
          ))}
        </dl>

        {!compact && (
          <div className="mt-8 flex flex-wrap gap-3">
            {showManage && (
              <button type="button" onClick={() => go(`/manage/${b.code}`)} className="btn min-h-[48px] bg-paper-ink text-paper hover:bg-black">
                Manage booking <span className="arrow">→</span>
              </button>
            )}
            {!cancelled && (
              <button type="button" onClick={() => downloadIcs(b)} className="btn border-paper-ink/40 bg-transparent text-paper-ink hover:border-paper-ink">
                Add to calendar
              </button>
            )}
          </div>
        )}
      </div>

      {/* perforated stub */}
      <div
        className={`relative border-paper-ink/25 bg-paper-2 p-6 sm:p-8 ${compact ? 'border-t border-dashed' : 'border-t border-dashed lg:border-l lg:border-t-0'}`}
      >
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-ink lg:-top-3" aria-hidden />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-ink lg:hidden" aria-hidden />
        <span className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-ink lg:block" aria-hidden />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-paper-ink/55">Total</div>
            <div className="display-wide text-[24px]">{naira(b.subtotal)}</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-paper-ink/55">
              {b.paymentStatus === 'deposit_paid' ? 'Deposit paid' : b.paymentStatus === 'refunded' ? 'Deposit refunded' : 'Deposit due'}
            </div>
            <div className="display-wide text-[24px]">{naira(b.depositAmount)}</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-paper-ink/55">On handover</div>
            <div className="mono text-[15px]">{naira(b.subtotal - b.depositAmount)}</div>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-paper-ink/55">Crew time</div>
            <div className="mono text-[15px]">{duration(b.setupMinutes + b.detailMinutes + b.inspectionMinutes)}</div>
          </div>
        </div>
        <div className="mt-6">
          <Stripes code={b.code} />
          <div className="mono mt-2 flex justify-between text-[10px] uppercase tracking-[0.14em] text-paper-ink/60">
            <span>{unit.callsign}</span>
            <span>Free changes until −{OPS.freeChangeHours}h</span>
          </div>
        </div>
      </div>
    </article>
  );
}
