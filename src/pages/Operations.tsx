import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { AutomotiveFooter } from '../components/apex/AutomotiveFooter';
import { OwnerCommandSurface } from '../components/apex/OwnerCommandSurface';
import { useBoard, useBoardData } from '../store/boardStore';
import { telemetry } from '../store/telemetryStore';

export default function Operations() {
  useBoardData();
  return (
    <>
      <div className="shell pb-10 pt-28 sm:pt-32">
        <OwnerCommandSurface />
        <ResetDemo />
      </div>
      <AutomotiveFooter showCta={false} />
    </>
  );
}

/** Restores the canonical seed. Only ever touches is_demo records; requires typing RESET. */
function ResetDemo() {
  const resetDemo = useBoard((s) => s.resetDemo);
  const mode = useBoard((s) => s.mode);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await resetDemo();
      telemetry('Demo data restored to canonical seed', { tone: 'ok', channel: 'OPS' });
      setOpen(false);
      setTyped('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-16 border-t border-line pt-6">
      {!open ? (
        <button type="button" className="label hover:!text-bone" onClick={() => setOpen(true)}>
          Reset demo data…
        </button>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl border border-amber/60 p-5">
            <div className="label mb-2 !text-amber">Reset demo</div>
            <p className="text-[14px] text-silver">
              Removes every booking flagged as demo data ({mode === 'supabase' ? 'is_demo = true in Supabase' : 'local demo store'}) and rebuilds the canonical week. Non-demo records are never touched.
            </p>
            <label className="mt-4 grid gap-2">
              <span className="label">Type RESET to confirm</span>
              <input className="field mono uppercase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-sm border-amber bg-amber text-ink" disabled={typed.trim().toUpperCase() !== 'RESET' || busy} onClick={() => void run()}>
                {busy ? 'Restoring…' : 'Restore seed'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
            {error && <p className="mt-3 text-[13px] text-tail">{error}</p>}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
