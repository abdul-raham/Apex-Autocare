import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { BRAND, OPS, UNITS, ZONES, type VehicleClassId } from '../../data/apex';
import { unitById } from '../../lib/catalog';
import { dayAvailability } from '../../lib/scheduling';
import { addDays, hhmm, lagosClock, relativeDayLabel } from '../../lib/time';
import { GarageEntry, type Point } from '../../motion/GarageEntry';
import { useApexPass } from '../../motion/ApexPass';
import { useBoardData, useNow } from '../../store/boardStore';
import { vehicleById } from '../../lib/catalog';
import { VehicleStage } from './VehicleStage';

export interface ArrivalHeroProps {
  vehicle?: VehicleClassId;
  eyebrow?: string;
  lines?: string[];
  support?: string;
  cta?: string;
  trust?: string[];
  /** Delay the entrance so it can follow the intro sequence. */
  entranceDelay?: number;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/** The next genuinely open window for a typical job — read from the live board. */
function useNextWindow() {
  const { bookings, status } = useBoardData();
  const now = useNow(60_000);
  return useMemo(() => {
    if (status !== 'ready') return null;
    const today = lagosClock(now).date;
    const spec = { classId: 'suv' as const, serviceId: 'signature-reset', addonIds: [], zoneId: 'lekki-phase-1' };
    for (let d = 0; d < 7; d++) {
      const date = addDays(today, d);
      const slot = dayAvailability({ date, spec, bookings, now }).find((s) => s.status === 'available');
      if (slot) return { date, start: slot.start, unit: unitById(slot.unitId!).name, today };
    }
    return null;
  }, [bookings, status, now]);
}

export function ArrivalHero({
  vehicle = 'suv',
  eyebrow = 'Mobile detailing · Lekki, Lagos',
  lines = ['Your car.', 'Reset.', 'Wherever', 'you are.'],
  support = 'Premium mobile detailing that comes to you. Configure your service, find a real available window and confirm your detail in minutes.',
  cta = 'Build my detail',
  trust = ['No calls', 'Live availability', 'Instant confirmation'],
  entranceDelay = 0,
}: ArrivalHeroProps) {
  const reduce = useReducedMotion();
  const { jump } = useApexPass();
  const frame = useRef<HTMLDivElement>(null);
  const [garage, setGarage] = useState<Point[] | null>(null);
  const next = useNextWindow();
  const d = entranceDelay;

  const start = () => {
    const rect = frame.current?.getBoundingClientRect();
    const lights = rect
      ? vehicleById(vehicle).headlights.map(([x, y]) => ({ x: rect.left + (rect.width * x) / 100, y: rect.top + (rect.height * y) / 100 }))
      : [];
    setGarage(lights);
  };

  const clearing = garage !== null;

  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden pb-10 pt-24 sm:pt-32 lg:pt-[18vh]" aria-labelledby="hero-title">
      {/* atmospheric backlight */}
      <div aria-hidden className="absolute inset-0 -z-10 [background:radial-gradient(ellipse_60%_50%_at_70%_45%,rgba(236,232,222,.07),transparent_70%)]" />
      <motion.div
        aria-hidden
        className="absolute left-0 right-0 top-[58%] -z-10 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.6, delay: d + 0.2, ease: EASE }}
      />

      {/* full-bleed vehicle stage: sits behind the type on desktop */}
      <motion.div
        className="relative mx-auto mb-2 w-[118%] -translate-x-[4%] lg:absolute lg:right-[-8vw] lg:top-[12%] lg:mb-0 lg:w-[68vw] lg:translate-x-0"
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 90, scale: 1.05 }}
        animate={clearing && !reduce ? { opacity: 1, x: '-22%', scale: 1.14 } : { opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: clearing ? 1 : 1.6, delay: clearing ? 0 : d + 0.3, ease: EASE }}
      >
        <VehicleStage
          vehicle={vehicle}
          variant="bleed"
          glint
          priority
          frameRef={frame}
          sizes="(max-width: 1024px) 118vw, 70vw"
          calloutDelay={d + 1.6}
          callouts={[
            { label: 'Clear coat', value: '118 µm · intact', at: [58, 14], dx: 8, dy: -7 },
            { label: 'Gloss', value: '94 GU ▲ 38', at: [42, 30], dx: -12, dy: -14 },
            { label: 'Brake dust', value: '0.0 g · cleared', at: [62, 60], dx: 14, dy: 14 },
          ]}
        />
      </motion.div>

      <div className="shell relative z-10">
        <motion.div
          className="label mb-6 flex flex-wrap items-center gap-x-4 gap-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={clearing ? { opacity: 0, y: -10 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: clearing ? 0 : d + 0.1, ease: EASE }}
        >
          <span className="flex items-center gap-2 !text-bone">
            <span className="dot-live" /> {eyebrow}
          </span>
          <span className="mono !text-[10px]">{BRAND.coordinates}</span>
        </motion.div>

        <h1 id="hero-title" className="display text-[clamp(60px,9vw,150px)] text-bone [text-shadow:0_2px_40px_rgba(10,11,11,.6)]">
          {lines.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.04em]">
              <motion.span
                className="block"
                initial={reduce ? { opacity: 0 } : { y: '105%' }}
                animate={clearing ? { y: '-110%', opacity: reduce ? 0 : 1 } : { y: '0%', opacity: 1 }}
                transition={{ duration: clearing ? 0.55 : 1.05, delay: clearing ? i * 0.05 : d + 0.25 + i * 0.12, ease: [0.76, 0, 0.24, 1] }}
              >
                {i === 1 ? (
                  <>
                    {line.replace(/\.$/, '')}
                    <span className="text-acid">.</span>
                  </>
                ) : (
                  line
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          className="mt-8 grid items-end gap-8 lg:mt-10 lg:grid-cols-[minmax(0,26rem)_1fr]"
          initial={{ opacity: 0, y: 16 }}
          animate={clearing ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: clearing ? 0 : d + 0.75, ease: EASE }}
        >
          <div>
            <p className="max-w-[44ch] text-[16px] leading-relaxed text-silver sm:text-[17px]">{support}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button type="button" className="btn btn-primary min-h-[56px] px-7 text-[12.5px]" onClick={start} disabled={clearing}>
                {cta} <span className="arrow">→</span>
              </button>
              <span className="label">~2 min · {OPS.depositRate * 100}% deposit locks the unit</span>
            </div>
          </div>
          <ul className="label flex flex-wrap items-center gap-x-3 gap-y-2 lg:justify-end lg:pb-4" aria-label="Why APEX">
            {trust.map((t, i) => (
              <li key={t} className="flex items-center gap-3">
                {i > 0 && <span className="text-dim">·</span>}
                <span className="!text-bone">{t}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* live telemetry ticker */}
      <motion.div
        className="shell mt-10 lg:mt-14"
        initial={{ opacity: 0 }}
        animate={{ opacity: clearing ? 0 : 1 }}
        transition={{ duration: 0.8, delay: clearing ? 0 : d + 1.1 }}
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-4">
          {[
            [
              'Next open window',
              next ? `${relativeDayLabel(next.date, next.today).replace(/^(\w+day) \d.*/, '$1')} ${hhmm(next.start)}` : '— — : — —',
            ],
            ['Assigned', next ? next.unit.replace('Mobile ', '') : 'Checking…'],
            ['Fleet', `${UNITS.length} units · ${hhmm(OPS.dispatchStart)}–${hhmm(OPS.dispatchEnd)}`],
            ['Coverage', `${ZONES.filter((z) => z.serviced).length} zones · Lekki run`],
          ].map(([k, v]) => (
            <div key={k} className="bg-ink px-4 py-3">
              <dt className="label !text-[9.5px]">{k}</dt>
              <dd className="mono mt-1 text-[13px] text-bone">{v}</dd>
            </div>
          ))}
        </dl>
      </motion.div>

      <GarageEntry active={clearing} lights={garage ?? []} onComplete={() => jump('/book', { entry: 'garage' })} />
    </section>
  );
}
