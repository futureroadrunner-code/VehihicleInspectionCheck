import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { ZONES } from "@/lib/zones";

const STEPS = ["Pick the day", "Driver & vehicle", "Walk-around", "Proof photos", "Send to the shop"];

export default function Home() {
  return (
    <div className="page">
      <main className="doc-wrap animate-rise">
        <header className="folio-head">
          <p className="folio-num">VC</p>
          <div>
            <p className="folio-brand">ASCA Office Solutions</p>
            <h1>Vehicle Check</h1>
            <p className="folio-lede">
              Walk the truck each day and email the shop. Friday sends the full week from this phone.
            </p>
          </div>
        </header>
        <hr className="chapter-rule" />

        <ol className="folio-index" aria-label="Check steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="sheet-actions">
          <span className="meta">About five minutes</span>
          <Link className="next" href="/check">
            Begin
          </Link>
        </div>

        <hr className="chapter-rule" />
        <p className="index-label">What gets checked</p>
        <ol className="folio-index">
          {ZONES.map((z, i) => (
            <li key={z.id}>
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              <span>{z.label}</span>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
