import { AnimatePresence, motion } from 'framer-motion';
import { ADDONS, OPS, SERVICES, type ZoneRegion } from '../../data/apex';
import { addonById, naira, serviceById, vehicleById } from '../../lib/catalog';
import { duration } from '../../lib/time';
import { useBooking, useQuote } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';
import { Ticker } from './Ticker';

export interface ServiceComposerProps {
  /** teaser: base services only, for the home page. */
  variant?: 'full' | 'teaser';
  onConfigure?: () => void;
}

const REGION_LABEL: Record<ZoneRegion, string> = {
  exterior: 'Paint',
  interior: 'Cabin',
  wheels: 'Wheels',
  glass: 'Glass',
  engine: 'Engine',
};

/**
 * The detail is assembled onto the car rather than picked off a price grid:
 * every service and module lights the regions it treats on a top-down plan,
 * and time + price roll up live from the shared draft.
 */
export function ServiceComposer({ variant = 'full', onConfigure }: ServiceComposerProps) {
  const serviceId = useBooking((s) => s.draft.serviceId);
  const addonIds = useBooking((s) => s.draft.addonIds);
  const classId = useBooking((s) => s.draft.classId);
  const setService = useBooking((s) => s.setService);
  const toggleAddon = useBooking((s) => s.toggleAddon);
  const q = useQuote();
  const vehicle = vehicleById(classId);
  const service = serviceById(serviceId);

  const lit = new Set<ZoneRegion>([...service.regions, ...addonIds.map((id) => addonById(id)?.region).filter((r): r is ZoneRegion => !!r)]);
  const moduleRegions = new Set(addonIds.map((id) => addonById(id)?.region));

  const pickService = (id: string) => {
    if (id === serviceId) return;
    setService(id);
    const s = serviceById(id);
    telemetry(`${s.name} mounted · ${duration(vehicle.baseMinutes + s.extraMinutes)} on a ${vehicle.label}`, { tone: 'ok', channel: 'QUOTE' });
  };
  const flipAddon = (id: string) => {
    const a = addonById(id)!;
    const on = !addonIds.includes(id);
    toggleAddon(id);
    telemetry(`${on ? '+' : '−'} ${a.name} · ${on ? '+' : '−'}${a.minutes}m · ${on ? '+' : '−'}${naira(a.price)}`, { tone: on ? 'ok' : 'info', channel: 'QUOTE' });
  };

  return (
    <section aria-labelledby="composer-title" className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(260px,.8fr)_minmax(0,1fr)] lg:gap-10">
      <h2 id="composer-title" className="sr-only">
        Compose your detail
      </h2>

      {/* base services */}
      <div className="order-2 lg:order-1">
        <div className="label mb-3">Base service · one</div>
        <div role="radiogroup" aria-label="Base service" className="border-t border-line">
          {SERVICES.map((s) => {
            const on = s.id === serviceId;
            const price = Math.round((s.basePrice * vehicle.priceMultiplier) / OPS.priceRounding) * OPS.priceRounding;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickService(s.id)}
                className={`group relative grid w-full grid-cols-[1fr_auto] gap-x-4 border-b border-line py-4 pl-4 pr-1 text-left transition-colors ${on ? 'bg-panel' : 'hover:bg-panel/50'}`}
              >
                {on && <motion.span layoutId="service-bar" className="absolute inset-y-0 left-0 w-[2px] bg-acid" />}
                <span>
                  <span className={`display block text-[clamp(24px,2.6vw,34px)] ${on ? 'text-bone' : 'text-silver group-hover:text-bone'}`}>{s.name}</span>
                  <span className="mt-1 block text-[13px] text-muted">{s.short}</span>
                </span>
                <span className="text-right">
                  <span className={`mono block text-[14px] ${on ? 'text-acid' : 'text-bone'}`}>{naira(price)}</span>
                  <span className="mono block text-[11px] text-muted">{duration(vehicle.baseMinutes + s.extraMinutes)}</span>
                  {s.tag && <span className="label mt-1 block !text-[9px]">{s.tag}</span>}
                </span>
                <AnimatePresence initial={false}>
                  {on && variant === 'full' && (
                    <motion.span
                      className="col-span-2 block overflow-hidden text-[13px] leading-relaxed text-silver"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    >
                      {s.description}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      {/* car plan */}
      <div className="order-1 lg:order-2">
        <div className="label mb-3 flex justify-between">
          <span>Treatment plan · {vehicle.label}</span>
          <span className="mono">{vehicle.surfaceM2} m²</span>
        </div>
        <div className="relative mx-auto max-w-[300px]">
          <CarPlan lit={lit} modules={moduleRegions} />
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Treated regions">
          {(Object.keys(REGION_LABEL) as ZoneRegion[]).map((r) => (
            <li key={r} className={`label border px-2 py-1 !text-[9.5px] transition-colors ${lit.has(r) ? 'border-acid/60 !text-acid' : 'border-line !text-dim'}`}>
              {REGION_LABEL[r]}
            </li>
          ))}
        </ul>
      </div>

      {/* modules */}
      <div className="order-3">
        {variant === 'full' ? (
          <>
            <div className="label mb-3">Modules · stack any</div>
            <div className="grid gap-2">
              {ADDONS.map((a) => {
                const on = addonIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => flipAddon(a.id)}
                    className={`group grid grid-cols-[22px_1fr_auto] items-start gap-3 border p-3 text-left transition-colors ${
                      on ? 'border-acid/70 bg-acid-soft' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className={`mt-0.5 grid h-[18px] w-[18px] place-items-center border ${on ? 'border-acid bg-acid text-ink' : 'border-line-strong'}`} aria-hidden>
                      {on && <span className="text-[11px] leading-none">✓</span>}
                    </span>
                    <span>
                      <span className="block text-[14px] font-medium text-bone">{a.name}</span>
                      <span className="block text-[12.5px] text-muted">{a.description}</span>
                    </span>
                    <span className="text-right">
                      <span className="mono block text-[12.5px] text-bone">+{naira(a.price)}</span>
                      <span className="mono block text-[11px] text-muted">+{a.minutes}m</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col justify-end gap-6">
            <p className="max-w-[36ch] text-silver">
              Stack modules — engine bay, pet hair, headlights, odour, wheels — and watch time and price assemble live. Every quote is computed, never guessed.
            </p>
            {onConfigure && (
              <button type="button" className="btn btn-primary w-fit" onClick={onConfigure}>
                Configure this detail <span className="arrow">→</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 border-t border-line pt-4">
          <div>
            <div className="label !text-[9.5px]">On the car</div>
            <div className="display-wide text-[22px] text-bone">
              <Ticker value={q.detailMinutes} format={(n) => duration(Math.round(n))} />
            </div>
          </div>
          <div className="text-right">
            <div className="label !text-[9.5px]">Assembled price</div>
            <div className="display-wide text-[22px] text-acid">
              <Ticker value={q.subtotal} format={naira} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Top-down schematic; regions light as services and modules are mounted. */
function CarPlan({ lit, modules }: { lit: Set<ZoneRegion>; modules: Set<ZoneRegion | undefined> }) {
  const on = (r: ZoneRegion) => lit.has(r);
  const fill = (r: ZoneRegion) => (on(r) ? 'rgba(201,255,61,.16)' : 'rgba(236,232,222,.02)');
  const stroke = (r: ZoneRegion) => (on(r) ? 'var(--color-acid)' : 'rgba(236,232,222,.22)');
  const t = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <svg viewBox="0 0 220 440" className="w-full" role="img" aria-label="Top-down vehicle plan showing treated regions">
      {/* measurement guides */}
      <g stroke="rgba(236,232,222,.12)" strokeDasharray="2 4">
        <line x1="10" y1="20" x2="10" y2="420" />
        <line x1="210" y1="20" x2="210" y2="420" />
      </g>
      <text x="4" y="232" fill="rgba(236,232,222,.35)" fontSize="8" fontFamily="JetBrains Mono" transform="rotate(-90 4 232)">
        LENGTH
      </text>

      {/* wheels */}
      {[
        [34, 84],
        [168, 84],
        [34, 302],
        [168, 302],
      ].map(([x, y]) => (
        <motion.rect key={`${x}${y}`} x={x} y={y} width="18" height="54" rx="3" initial={false} animate={{ fill: fill('wheels'), stroke: stroke('wheels') }} transition={t} strokeWidth="1.2" />
      ))}

      {/* body / paint */}
      <motion.path
        d="M70 22 Q110 10 150 22 Q176 30 180 70 L184 380 Q182 414 150 420 Q110 428 70 420 Q38 414 36 380 L40 70 Q44 30 70 22 Z"
        initial={false}
        animate={{ fill: on('exterior') ? 'rgba(201,255,61,.07)' : 'rgba(236,232,222,.02)', stroke: stroke('exterior') }}
        transition={t}
        strokeWidth="1.4"
      />

      {/* engine bay / bonnet */}
      <motion.path d="M58 44 Q110 30 162 44 L164 128 L56 128 Z" initial={false} animate={{ fill: fill('engine'), stroke: stroke('engine') }} transition={t} strokeWidth="1" />
      <g stroke="rgba(236,232,222,.14)">
        <line x1="84" y1="60" x2="84" y2="116" />
        <line x1="136" y1="60" x2="136" y2="116" />
      </g>

      {/* glass */}
      <motion.path d="M60 136 L160 136 L150 176 L70 176 Z" initial={false} animate={{ fill: fill('glass'), stroke: stroke('glass') }} transition={t} strokeWidth="1" />
      <motion.path d="M70 330 L150 330 L158 360 L62 360 Z" initial={false} animate={{ fill: fill('glass'), stroke: stroke('glass') }} transition={t} strokeWidth="1" />

      {/* cabin */}
      <motion.rect x="66" y="182" width="88" height="142" rx="6" initial={false} animate={{ fill: fill('interior'), stroke: stroke('interior') }} transition={t} strokeWidth="1" />
      {[
        [74, 196],
        [116, 196],
        [74, 262],
        [116, 262],
      ].map(([x, y]) => (
        <motion.rect key={`s${x}${y}`} x={x} y={y} width="30" height="46" rx="5" initial={false} animate={{ stroke: on('interior') ? 'rgba(201,255,61,.6)' : 'rgba(236,232,222,.14)' }} fill="none" transition={t} />
      ))}

      {/* module badges */}
      {(
        [
          ['engine', 110, 86],
          ['interior', 110, 250],
          ['glass', 110, 156],
          ['wheels', 43, 111],
        ] as [ZoneRegion, number, number][]
      ).map(([r, x, y]) =>
        modules.has(r) ? (
          <motion.g key={`m${r}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ originX: `${x}px`, originY: `${y}px` }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
            <circle cx={x} cy={y} r="9" fill="var(--color-acid)" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a0b0b">
              +
            </text>
          </motion.g>
        ) : null,
      )}
      <text x="110" y="436" textAnchor="middle" fill="rgba(236,232,222,.35)" fontSize="8" fontFamily="JetBrains Mono" letterSpacing="2">
        REAR
      </text>
      <text x="110" y="14" textAnchor="middle" fill="rgba(236,232,222,.35)" fontSize="8" fontFamily="JetBrains Mono" letterSpacing="2">
        FRONT
      </text>
    </svg>
  );
}
