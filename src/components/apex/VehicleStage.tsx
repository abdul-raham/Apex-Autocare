import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react';
import type { VehicleClassId } from '../../data/apex';
import { vehicleById } from '../../lib/catalog';

export interface StageHotspot {
  id: string;
  label: string;
  /** % of width / height on the vehicle image. */
  at: [number, number];
}

export interface TelemetryLabel {
  label: string;
  value: string;
  corner: 'tl' | 'tr' | 'bl' | 'br';
}

export interface Callout {
  label: string;
  value: string;
  /** Point on the car, % of the image. */
  at: [number, number];
  /** Where the readout sits relative to the point, in % of the frame. */
  dx: number;
  dy: number;
}

export interface VehicleStageProps {
  vehicle: VehicleClassId;
  /** framed: panel with brackets. bleed: no frame, edges dissolve into the page. */
  variant?: 'framed' | 'bleed';
  callouts?: Callout[];
  /** Delay (s) before callouts draw in. */
  calloutDelay?: number;
  /** Show the before/after scrubber. */
  beforeAfter?: boolean;
  /** Breathing headlight glow. */
  glint?: boolean;
  hotspots?: StageHotspot[];
  activeHotspot?: string | null;
  onHotspot?: (id: string) => void;
  /** Dim everything except a circle at this point (% coords). */
  spotlight?: [number, number] | null;
  telemetry?: TelemetryLabel[];
  /** Angle descriptor shown in the telemetry frame. */
  angle?: string;
  priority?: boolean;
  frameRef?: Ref<HTMLDivElement>;
  className?: string;
  sizes?: string;
}

const BLEED_MASK =
  'linear-gradient(to right, transparent 0%, #000 24%, #000 90%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 14%, #000 80%, transparent 100%)';

const CORNER: Record<TelemetryLabel['corner'], string> = {
  tl: 'left-4 top-4 text-left',
  tr: 'right-4 top-4 text-right',
  bl: 'bottom-4 left-4 text-left',
  br: 'bottom-4 right-4 text-right',
};

/**
 * Photographic vehicle canvas. The frame is locked to 16:10 so % coordinates
 * (headlights, hotspots, spotlight) map straight onto the image. Swapping vehicle
 * runs a tracking-camera crossfade; if the photo fails it falls back to a line
 * drawing instead of a broken image.
 */
export function VehicleStage({
  vehicle,
  variant = 'framed',
  callouts = [],
  calloutDelay = 0.6,
  beforeAfter = false,
  glint = false,
  hotspots = [],
  activeHotspot = null,
  onHotspot,
  spotlight = null,
  telemetry = [],
  angle = 'FRONT 3/4',
  priority = false,
  frameRef,
  className = '',
  sizes = '(max-width: 900px) 100vw, 60vw',
}: VehicleStageProps) {
  const v = vehicleById(vehicle);
  const reduce = useReducedMotion();
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <div className={`${variant === 'framed' ? 'brackets' : ''} relative ${className}`}>
      <div
        ref={frameRef}
        className={`relative aspect-[16/10] w-full overflow-hidden ${variant === 'framed' ? 'rounded-[4px] bg-graphite' : ''}`}
        style={
          variant === 'bleed'
            ? {
                maskImage: BLEED_MASK,
                WebkitMaskImage: BLEED_MASK,
                maskComposite: 'intersect',
                WebkitMaskComposite: 'source-in',
              }
            : undefined
        }
      >
        {variant === 'framed' && (
          <>
            <div aria-hidden className="absolute inset-x-0 bottom-[18%] h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
            <div aria-hidden className="absolute inset-0 opacity-40 [background:radial-gradient(ellipse_at_50%_85%,rgba(236,232,222,.08),transparent_60%)]" />
          </>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={v.id}
            className="absolute inset-0"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: '9%', scale: 1.06, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: '0%', scale: 1, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: '-7%', scale: 0.97, filter: 'blur(6px)' }}
            transition={{ duration: reduce ? 0.2 : 0.75, ease: [0.16, 1, 0.3, 1] }}
          >
            {!loaded[v.id] && !failed[v.id] && <div className="skeleton absolute inset-0" aria-hidden />}
            {failed[v.id] ? (
              <Silhouette label={v.label} />
            ) : beforeAfter ? (
              <BeforeAfter
                src={v.image.src}
                srcSet={v.image.srcSet}
                alt={v.image.alt}
                sizes={sizes}
                priority={priority}
                onLoad={() => setLoaded((s) => ({ ...s, [v.id]: true }))}
                onError={() => setFailed((s) => ({ ...s, [v.id]: true }))}
              />
            ) : (
              <img
                src={v.image.src}
                srcSet={v.image.srcSet}
                sizes={sizes}
                alt={v.image.alt}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                onLoad={() => setLoaded((s) => ({ ...s, [v.id]: true }))}
                onError={() => setFailed((s) => ({ ...s, [v.id]: true }))}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {glint && !failed[v.id] && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {v.headlights.map(([x, y], i) => (
              <motion.span
                key={`${v.id}-${i}`}
                className="absolute h-[18%] w-[11%] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
                style={{ left: `${x}%`, top: `${y}%`, background: 'radial-gradient(closest-side, rgba(255,255,255,.85), rgba(214,236,255,.28) 45%, transparent)' }}
                initial={{ opacity: 0 }}
                animate={reduce ? { opacity: 0.5 } : { opacity: [0, 0.9, 0.35, 0.75] }}
                transition={reduce ? { duration: 0.2 } : { duration: 5.5, delay: 1.2 + i * 0.15, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
              />
            ))}
          </div>
        )}

        {/* spotlight isolation */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{
            opacity: spotlight ? 1 : 0,
            background: spotlight
              ? `radial-gradient(circle at ${spotlight[0]}% ${spotlight[1]}%, rgba(10,11,11,0) 0%, rgba(10,11,11,0) 11%, rgba(10,11,11,.8) 24%)`
              : 'radial-gradient(circle at 50% 50%, rgba(10,11,11,0) 0%, rgba(10,11,11,0) 11%, rgba(10,11,11,.8) 24%)',
          }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* hotspots */}
        {hotspots.map((h) => {
          const on = activeHotspot === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onHotspot?.(h.id)}
              onMouseEnter={() => onHotspot?.(h.id)}
              onFocus={() => onHotspot?.(h.id)}
              aria-pressed={on}
              aria-label={`Isolate ${h.label}`}
              className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 p-3"
              style={{ left: `${h.at[0]}%`, top: `${h.at[1]}%` }}
            >
              <span className={`relative block h-3 w-3 rotate-45 border transition-colors ${on ? 'border-acid bg-acid' : 'border-bone bg-ink/60'}`} />
              {!on && <span aria-hidden className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full border border-bone/70 animate-pulse-ring" />}
              <span
                className={`label absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap bg-ink/80 px-1.5 py-0.5 transition-opacity ${
                  on ? '!text-acid opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {h.label}
              </span>
            </button>
          );
        })}

        {/* telemetry */}
        {telemetry.map((t) => (
          <div key={t.label} className={`pointer-events-none absolute z-[5] ${CORNER[t.corner]}`}>
            <div className="label !text-[9.5px]">{t.label}</div>
            <div className="mono text-[12px] text-bone">{t.value}</div>
          </div>
        ))}
        {variant === 'framed' && (
          <span className="label pointer-events-none absolute bottom-4 left-1/2 z-[5] hidden -translate-x-1/2 !text-[9.5px] sm:block">
            {v.label.toUpperCase()} · {angle} · {v.surfaceM2} M² PAINT
          </span>
        )}
      </div>
      {callouts.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 z-20 hidden h-full w-full overflow-visible md:block" aria-hidden>
          {callouts.map((c, i) => {
            const x2 = c.at[0] + c.dx;
            const y2 = c.at[1] + c.dy;
            return (
              <g key={c.label}>
                <motion.circle
                  cx={`${c.at[0]}%`}
                  cy={`${c.at[1]}%`}
                  r="3.5"
                  fill="var(--color-ink)"
                  stroke="var(--color-acid)"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: calloutDelay + i * 0.18, duration: 0.4 }}
                />
                <motion.line
                  x1={`${c.at[0]}%`}
                  y1={`${c.at[1]}%`}
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke="rgba(236,232,222,.45)"
                  strokeWidth="1"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: calloutDelay + 0.1 + i * 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.foreignObject
                  x={`${x2 + (c.dx >= 0 ? 0.6 : -26.6)}%`}
                  y={`${y2 - 3.2}%`}
                  width="26%"
                  height="8%"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: calloutDelay + 0.45 + i * 0.18, duration: 0.5 }}
                >
                  <div className={c.dx >= 0 ? 'text-left' : 'text-right'}>
                    <div className="label !text-[9.5px] leading-tight">{c.label}</div>
                    <div className="mono text-[12.5px] leading-tight text-bone">{c.value}</div>
                  </div>
                </motion.foreignObject>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ─── Before / after scrubber ─────────────────────────────────────────────── */

function BeforeAfter({
  src,
  srcSet,
  alt,
  sizes,
  priority,
  onLoad,
  onError,
}: {
  src: string;
  srcSet: string;
  alt: string;
  sizes: string;
  priority: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  const reduce = useReducedMotion();
  const split = useMotionValue(reduce ? 50 : 100);
  const clip = useTransform(split, (s) => `inset(0 ${100 - s}% 0 0)`);
  const handleLeft = useTransform(split, (s) => `${s}%`);
  const [value, setValue] = useState(reduce ? 50 : 100);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => split.on('change', (v) => setValue(Math.round(v))), [split]);

  // A one-off automatic sweep shows what the scrubber does.
  useEffect(() => {
    if (reduce) return;
    const controls = animate(split, [100, 22, 54], { duration: 2.6, delay: 0.9, ease: [0.65, 0, 0.35, 1] });
    return () => controls.stop();
  }, [reduce, split]);

  const setFromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    split.set(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromPointer(e.clientX);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === 'ArrowLeft') split.set(Math.max(0, split.get() - step));
    else if (e.key === 'ArrowRight') split.set(Math.min(100, split.get() + step));
    else if (e.key === 'Home') split.set(0);
    else if (e.key === 'End') split.set(100);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging.current && setFromPointer(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* AFTER: clean */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* BEFORE: dulled paint, road film and water spotting */}
      <motion.div aria-hidden className="absolute inset-0" style={{ clipPath: clip }}>
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: 'grayscale(.45) sepia(.4) saturate(.7) brightness(.72) contrast(.78)' }}
          draggable={false}
        />
        <div className="absolute inset-0 opacity-80 mix-blend-multiply [background:url(/images/fx-dust-tile.webp)_repeat] [background-size:256px]" />
        <div className="absolute inset-0 bg-[url(/images/fx-road-film.webp)] bg-cover opacity-90 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#8a7a5c]/30 via-[#6d6250]/10 to-[#3b3326]/30" />
      </motion.div>

      {/* handle */}
      <motion.div className="absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-bone/90" style={{ left: handleLeft }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Before and after comparison"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${value}% before`}
          onKeyDown={onKey}
          className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-bone bg-ink/80 backdrop-blur"
        >
          <span className="mono text-[11px] text-bone">◂▸</span>
        </div>
        <span className="label absolute right-3 top-[34%] whitespace-nowrap bg-ink/70 px-1.5 py-0.5 !text-amber">◂ Before</span>
        <span className="label absolute left-3 top-[34%] whitespace-nowrap bg-ink/70 px-1.5 py-0.5 !text-acid">After ▸</span>
      </motion.div>
    </div>
  );
}

function Silhouette({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <svg viewBox="0 0 400 160" className="w-3/4 text-line-strong" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <path d="M20 120h40a26 26 0 0 1 52 0h176a26 26 0 0 1 52 0h40v-22l-30-10-58-40H150l-62 38-58 8-10 12z" />
        <circle cx="86" cy="120" r="20" />
        <circle cx="314" cy="120" r="20" />
        <path d="M156 52h60v38h-98zM228 52h40l42 38h-82z" />
      </svg>
      <span className="label absolute bottom-10">{label} · image offline — telemetry only</span>
    </div>
  );
}
