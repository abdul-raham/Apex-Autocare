import { AnimatePresence, motion } from 'framer-motion';
import { useId, useMemo, useState } from 'react';
import { BRAND, DISPATCH_RADIUS_KM, RADAR_RINGS_KM, ZONES, type ServiceZone } from '../../data/apex';
import { naira, zoneById } from '../../lib/catalog';
import { useBooking } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';

export interface LocationRadarProps {
  variant?: 'full' | 'teaser';
}

const MAX_KM = RADAR_RINGS_KM[RADAR_RINGS_KM.length - 1];
/** sqrt scale keeps the dense Lekki cluster readable next to far zones. */
const radius = (km: number) => 46 * Math.sqrt(km / MAX_KM);

function position(z: ServiceZone) {
  const r = radius(z.distanceKm);
  const a = (z.bearing * Math.PI) / 180;
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
}

/**
 * Where is the car? Radar rings show the dispatch radius around APEX Bay; the
 * chosen zone gets a routed line, travel estimate (with rush-hour penalty),
 * surcharge and a clear in-run / out-of-range verdict.
 */
export function LocationRadar({ variant = 'full' }: LocationRadarProps) {
  const zoneId = useBooking((s) => s.draft.zoneId);
  const setZone = useBooking((s) => s.setZone);
  const address = useBooking((s) => s.draft.address);
  const setAddress = useBooking((s) => s.setAddress);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const listId = useId();

  const zone = zoneById(hover ?? zoneId ?? '') ?? null;
  const selected = zoneId ? zoneById(zoneId) ?? null : null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ZONES.filter((z) => z.name.toLowerCase().includes(q)) : ZONES;
  }, [query]);

  const choose = (z: ServiceZone) => {
    setZone(z.id);
    setQuery('');
    if (z.serviced) {
      telemetry(`Route locked · ${z.name} · ${z.travelMinutes}m out${z.surcharge ? ` · +${naira(z.surcharge)}` : ''}`, { tone: 'ok', channel: 'ROUTE' });
    } else {
      telemetry(`${z.name} is outside the mobile run`, { tone: 'warn', channel: 'ROUTE' });
    }
  };

  const target = selected ? position(selected) : null;

  return (
    <section aria-labelledby="radar-title" className="grid items-center gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-14">
      <div>
        <h2 id="radar-title" className="sr-only">
          Service location
        </h2>
        <label htmlFor={`${listId}-q`} className="label mb-2 block">
          Where's the car? · Lagos zone
        </label>
        <input
          id={`${listId}-q`}
          className="field"
          placeholder="Search Lekki, Ikoyi, VI, Ajah…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-controls={listId}
          autoComplete="off"
        />
        <ul id={listId} className="mt-2 grid max-h-[300px] overflow-auto border-y border-line scrollbar-none" aria-label="Zones">
          {matches.map((z) => {
            const on = z.id === zoneId;
            return (
              <li key={z.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(z)}
                  onMouseEnter={() => setHover(z.id)}
                  onMouseLeave={() => setHover(null)}
                  className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-3 py-2.5 text-left text-[14px] transition-colors last:border-b-0 ${
                    on ? 'bg-panel text-bone' : 'text-silver hover:bg-panel/60 hover:text-bone'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 ${z.serviced ? (on ? 'bg-acid' : 'bg-silver') : 'border border-tail'}`} aria-hidden />
                    {z.name}
                  </span>
                  <span className="mono text-[11.5px] text-muted">{z.serviced ? `${z.travelMinutes}m` : 'out of run'}</span>
                  <span className="mono w-[64px] text-right text-[11.5px] text-muted">{z.surcharge ? `+${naira(z.surcharge)}` : z.serviced ? 'no fee' : '—'}</span>
                </button>
              </li>
            );
          })}
          {matches.length === 0 && <li className="label px-3 py-4">No zone matches — we cover Lekki to Sangotedo, VI and Ikoyi</li>}
        </ul>

        {variant === 'full' && (
          <label className="mt-5 grid gap-2">
            <span className="label">Street address / estate · gate code</span>
            <input
              className="field"
              placeholder="e.g. 14 Admiralty Way, Lekki Phase 1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              maxLength={240}
            />
          </label>
        )}
      </div>

      <div>
        <div className="relative mx-auto aspect-square w-full max-w-[520px]">
          {/* sweep */}
          <div
            aria-hidden
            className="absolute inset-[4%] animate-sweep rounded-full"
            style={{ background: 'conic-gradient(from 0deg, rgba(201,255,61,.16), rgba(201,255,61,0) 55deg, transparent 360deg)' }}
          />
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            {RADAR_RINGS_KM.map((km) => (
              <g key={km}>
                <circle
                  cx="50"
                  cy="50"
                  r={radius(km)}
                  fill="none"
                  stroke={km === DISPATCH_RADIUS_KM ? 'rgba(201,255,61,.45)' : 'rgba(236,232,222,.12)'}
                  strokeWidth={km === DISPATCH_RADIUS_KM ? 0.35 : 0.25}
                  strokeDasharray={km === DISPATCH_RADIUS_KM ? '1 1' : undefined}
                />
                <text x={50 + 0.8} y={50 - radius(km) + 2.4} fontSize="1.9" fill="rgba(236,232,222,.35)" fontFamily="JetBrains Mono">
                  {km}KM{km === DISPATCH_RADIUS_KM ? ' · DISPATCH LIMIT' : ''}
                </text>
              </g>
            ))}
            <line x1="50" y1="3" x2="50" y2="97" stroke="rgba(236,232,222,.07)" strokeWidth="0.2" />
            <line x1="3" y1="50" x2="97" y2="50" stroke="rgba(236,232,222,.07)" strokeWidth="0.2" />
            {(['N', 'E', 'S', 'W'] as const).map((c, i) => (
              <text key={c} x={[50, 98, 50, 2][i]} y={[2.6, 51, 99.4, 51][i]} textAnchor="middle" fontSize="2.2" fill="rgba(236,232,222,.4)" fontFamily="JetBrains Mono">
                {c}
              </text>
            ))}

            {/* route to the selected zone */}
            <AnimatePresence>
              {target && selected && (
                <motion.g key={selected.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.line
                    x1="50"
                    y1="50"
                    x2={target.x}
                    y2={target.y}
                    stroke={selected.serviced ? 'var(--color-acid)' : 'var(--color-tail)'}
                    strokeWidth="0.45"
                    strokeDasharray="1.2 0.8"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1, strokeDashoffset: [0, -8] }}
                    transition={{ pathLength: { duration: 0.7, ease: [0.16, 1, 0.3, 1] }, strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: 'linear' } }}
                  />
                  <circle cx={target.x} cy={target.y} r="2.6" fill="none" stroke={selected.serviced ? 'var(--color-acid)' : 'var(--color-tail)'} strokeWidth="0.3">
                    <animate attributeName="r" values="1.5;4.5" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                </motion.g>
              )}
            </AnimatePresence>
          </svg>

          {/* base */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
            <span className="block h-3 w-3 rotate-45 border border-bone bg-ink" />
            <span className="label absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap !text-[9px] !text-bone">APEX BAY</span>
          </div>

          {/* zone blips (real buttons for keyboard + screen readers) */}
          {ZONES.map((z) => {
            const p = position(z);
            const on = z.id === zoneId;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => choose(z)}
                onMouseEnter={() => setHover(z.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(z.id)}
                onBlur={() => setHover(null)}
                aria-label={`${z.name}${z.serviced ? `, ${z.travelMinutes} minutes` : ', outside service area'}`}
                aria-pressed={on}
                className="group absolute -translate-x-1/2 -translate-y-1/2 p-2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span
                  className={`block h-2 w-2 transition-transform group-hover:scale-150 ${
                    z.serviced ? (on ? 'bg-acid shadow-[0_0_10px_rgba(201,255,61,.9)]' : 'bg-silver') : 'rounded-full border border-tail'
                  }`}
                />
                <span
                  className={`label pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap !text-[9px] transition-opacity ${
                    on || hover === z.id ? '!text-bone opacity-100' : 'opacity-0 sm:opacity-60'
                  }`}
                >
                  {z.name.split(' / ')[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* readout */}
        <div className="mt-4 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4" aria-live="polite">
          {zone ? (
            [
              ['Zone', zone.name.split(' / ')[0]],
              ['Travel', zone.serviced ? `${zone.travelMinutes}m · rush ${Math.ceil((zone.travelMinutes * zone.peakFactor) / 5) * 5}m` : '—'],
              ['Surcharge', zone.serviced ? (zone.surcharge ? naira(zone.surcharge) : 'None') : '—'],
              ['Status', zone.serviced ? 'In the run' : 'Out of range'],
            ].map(([k, v], i) => (
              <div key={k} className="bg-ink px-3 py-2.5">
                <div className="label !text-[9px]">{k}</div>
                <div className={`mono mt-0.5 truncate text-[12.5px] ${i === 3 ? (zone.serviced ? 'text-acid' : 'text-tail') : 'text-bone'}`}>{v}</div>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-ink px-3 py-3">
              <span className="label">Awaiting coordinates · base {BRAND.coordinates}</span>
            </div>
          )}
        </div>
        {zone && !zone.serviced && <p className="mt-2 text-[13px] text-tail">{zone.note}</p>}
      </div>
    </section>
  );
}
