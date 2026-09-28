import { motion } from 'framer-motion';
import { useRef, type KeyboardEvent } from 'react';
import { VEHICLE_CLASSES, type VehicleClassId } from '../../data/apex';
import { vehicleById } from '../../lib/catalog';
import { duration } from '../../lib/time';
import { useBooking } from '../../store/bookingStore';
import { telemetry } from '../../store/telemetryStore';
import { VehicleStage } from './VehicleStage';

export interface VehicleMorphSelectorProps {
  /** Controlled value; defaults to the shared booking draft. */
  value?: VehicleClassId;
  onChange?: (id: VehicleClassId) => void;
  showStage?: boolean;
  showModelInput?: boolean;
}

/**
 * Body-class selector as a gear gate: the indicator snaps between classes, the
 * stage runs a tracking-camera morph to the new vehicle, and base duration and the
 * quote recalculate from the shared draft.
 */
export function VehicleMorphSelector({ value, onChange, showStage = true, showModelInput = true }: VehicleMorphSelectorProps) {
  const draftClass = useBooking((s) => s.draft.classId);
  const setVehicle = useBooking((s) => s.setVehicle);
  const label = useBooking((s) => s.draft.vehicleLabel);
  const setLabel = useBooking((s) => s.setVehicleLabel);
  const current = value ?? draftClass;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (id: VehicleClassId) => {
    if (id === current) return;
    if (onChange) onChange(id);
    else setVehicle(id);
    const v = vehicleById(id);
    telemetry(`Base duration → ${duration(v.baseMinutes)} · ${v.label} · ×${v.priceMultiplier} surface`, { tone: 'ok', channel: 'QUOTE' });
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = VEHICLE_CLASSES.length;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(VEHICLE_CLASSES[next].id);
    refs.current[next]?.focus();
  };

  const v = vehicleById(current);

  return (
    <section aria-labelledby="vehicle-title">
      {showStage && (
        <div className="relative mb-6">
          <VehicleStage
            vehicle={current}
            glint
            sizes="(max-width: 1024px) 100vw, 60vw"
            telemetry={[
              { label: 'Body class', value: v.label.toUpperCase(), corner: 'tl' },
              { label: 'Base detail', value: duration(v.baseMinutes), corner: 'tr' },
              { label: 'Paint surface', value: `${v.surfaceM2} m²`, corner: 'br' },
            ]}
          />
        </div>
      )}

      <h2 id="vehicle-title" className="sr-only">
        Select vehicle class
      </h2>
      <div role="radiogroup" aria-labelledby="vehicle-title" className="relative grid grid-cols-5 border-y border-line">
        {VEHICLE_CLASSES.map((c, i) => {
          const on = c.id === current;
          return (
            <button
              key={c.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(c.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`group relative px-1.5 py-4 text-left transition-colors sm:px-4 sm:py-5 ${i > 0 ? 'border-l border-line' : ''}`}
            >
              {on && (
                <motion.span
                  layoutId="gear-indicator"
                  className="absolute inset-x-0 -top-px h-[2px] bg-acid shadow-[0_0_14px_rgba(201,255,61,.7)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <span className={`label block !text-[9.5px] ${on ? '!text-acid' : ''}`}>0{i + 1}</span>
              <span className={`display mt-1 block text-[clamp(22px,3.4vw,40px)] transition-colors ${on ? 'text-bone' : 'text-dim group-hover:text-silver'}`}>
                {c.label}
              </span>
              <span className="mono mt-1 block text-[10.5px] text-muted sm:text-[11.5px]">{duration(c.baseMinutes)}</span>
              <span className="mt-1 hidden text-[12px] text-dim lg:block">{c.examples}</span>
            </button>
          );
        })}
      </div>

      {showModelInput && (
        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-2">
            <span className="label">Make & model (optional)</span>
            <input
              className="field"
              placeholder={`e.g. ${v.examples.split(' · ')[0]}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
              maxLength={60}
            />
          </label>
          <p className="label pb-3 sm:text-right">Crew brief uses this to pack the right products</p>
        </div>
      )}
    </section>
  );
}
