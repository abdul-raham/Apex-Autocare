import { useState, type FormEvent } from 'react';
import { BRAND, OPS, UNITS, ZONES } from '../../data/apex';
import { normalizeCode } from '../../lib/bookings';
import { hhmm } from '../../lib/time';
import { ApexLink, useApexPass } from '../../motion/ApexPass';
import { useBoard } from '../../store/boardStore';

export function AutomotiveFooter({ showCta = true }: { showCta?: boolean }) {
  const { go } = useApexPass();
  const mode = useBoard((s) => s.mode);
  const [code, setCode] = useState('');

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length >= 4) go(`/manage/${normalizeCode(code)}`);
  };

  return (
    <footer className="relative mt-24 border-t border-line bg-ink">
      {showCta && (
        <div className="shell flex flex-col items-start justify-between gap-8 border-b border-line py-16 md:flex-row md:items-end md:py-24">
          <div>
            <div className="label mb-5">Final approach · {BRAND.base}</div>
            <p className="display text-[clamp(56px,10vw,152px)] text-bone">
              Start your
              <br />
              detail<span className="text-acid">.</span>
            </p>
          </div>
          <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={() => go('/book')}>
            Start your detail <span className="arrow">→</span>
          </button>
        </div>
      )}

      <div className="shell grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="display-wide text-[19px] text-bone">
            APEX<span className="text-acid">°</span> AutoCare
          </div>
          <p className="mt-3 max-w-[30ch] text-[13px] text-muted">Premium mobile detailing that comes to you, across the Lekki run.</p>
          <p className="mono mt-4 text-[11px] text-silver">{BRAND.coordinates}</p>
        </div>

        <div>
          <div className="label mb-3">Operating area</div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-silver">
            {ZONES.filter((z) => z.serviced).map((z) => (
              <li key={z.id}>{z.name}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="label mb-3">Dispatch</div>
          <ul className="mono grid gap-1 text-[12px] text-silver">
            <li>
              {hhmm(OPS.dispatchStart)}–{hhmm(OPS.dispatchEnd)} · 7 days
            </li>
            <li>{UNITS.length} mobile units · water + power on board</li>
            <li>Base: {BRAND.base}</li>
          </ul>
          <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Footer">
            <ApexLink to="/book" className="text-bone underline-offset-4 hover:underline">
              Book
            </ApexLink>
            <ApexLink to="/process" className="text-bone underline-offset-4 hover:underline">
              Process
            </ApexLink>
            <ApexLink to="/operations" className="text-bone underline-offset-4 hover:underline">
              Owner view
            </ApexLink>
          </nav>
        </div>

        <form onSubmit={lookup} className="flex flex-col gap-3" aria-label="Manage a booking">
          <label htmlFor="footer-code" className="label">
            Manage booking
          </label>
          <div className="flex gap-2">
            <input
              id="footer-code"
              className="field mono uppercase"
              placeholder="APX-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-ghost shrink-0" aria-label="Open booking">
              →
            </button>
          </div>
        </form>
      </div>

      <div className="shell flex flex-col justify-between gap-2 border-t border-line py-5 sm:flex-row">
        <span className="label">© {new Date().getFullYear()} APEX AutoCare · Lagos</span>
        <span className="label">
          Data: {mode === 'supabase' ? 'Supabase · live' : 'Local demo store'} · Payments simulated for demo
        </span>
      </div>
    </footer>
  );
}
