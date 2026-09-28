import { ApexLink } from '../motion/ApexPass';

export default function NotFound() {
  return (
    <section className="shell grid min-h-[100svh] content-center gap-6 pt-24">
      <span className="label !text-tail">● Off route · 404</span>
      <h1 className="display text-[clamp(64px,12vw,180px)]">Wrong turn.</h1>
      <p className="max-w-[40ch] text-silver">This road isn't on the Lekki run. Head back to base or start a booking.</p>
      <div className="flex flex-wrap gap-3">
        <ApexLink to="/" className="btn btn-ghost">← Back to base</ApexLink>
        <ApexLink to="/book" className="btn btn-primary">Build my detail <span className="arrow">→</span></ApexLink>
      </div>
    </section>
  );
}
