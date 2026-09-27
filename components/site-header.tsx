import Link from "next/link";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="nav-pill">
      <Link className="wordmark" href="/">
        FleetCheck
      </Link>
      {children}
    </header>
  );
}
