import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ZONES } from "@/lib/zones";

export default function Home() {
  return (
    <main>
      <SiteHeader>
        <Link className="btn btn-accent btn-nav" href="/check">
          Start check
        </Link>
      </SiteHeader>

      <section className="hero-work" aria-label="Start">
        <p className="hero-brand">FleetCheck</p>
        <h1 className="hero-title">Daily vehicle check</h1>
        <p className="hero-lede">
          Walk the truck each day, log incidents, email the shop. Friday sends the full week from
          this phone’s backup.
        </p>
        <div className="actions-row">
          <Link className="btn btn-accent btn-xl" href="/check">
            Start check
          </Link>
          <a className="btn btn-ghost btn-xl" href="#walk">
            What gets checked
          </a>
        </div>
      </section>

      <section className="chapter" id="walk">
        <h2 className="chapter-title">Walk-around</h2>
        <p className="chapter-lede">Pass or needs attention. A note opens only when something is off.</p>
        <ul className="zone-list">
          {ZONES.map((z, i) => (
            <li key={z.id}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              {z.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="chapter">
        <div className="flow-strip">
          <div className="flow-step">
            <strong>Pick the day</strong>
            <p>Today is highlighted — tap the day you’re checking</p>
          </div>
          <div className="flow-step">
            <strong>Inspect</strong>
            <p>Eleven zones · pass / attention</p>
          </div>
          <div className="flow-step">
            <strong>Prove</strong>
            <p>Four photos, compressed on-device</p>
          </div>
          <div className="flow-step">
            <strong>Send</strong>
            <p>Email to the shop inbox</p>
          </div>
        </div>
      </section>

      <section className="chapter">
        <div className="action-panel">
          <h2>Ready when you are</h2>
          <p>Three techs. One inbox. About five minutes.</p>
          <Link className="btn btn-accent btn-xl" href="/check">
            Start check
          </Link>
        </div>
      </section>

      <footer className="foot-statement">
        <p className="line">Check it. Send it. Drive on.</p>
        <p className="meta">FleetCheck · ASCA · service@ascaofficesolutions.com</p>
      </footer>
    </main>
  );
}
