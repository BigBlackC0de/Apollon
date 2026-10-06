"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Boussole" },
  { href: "/partis", label: "Partis" },
  { href: "/themes", label: "Thèmes" },
  { href: "/scrutins", label: "Scrutins" },
  { href: "/parlementaires", label: "Parlementaires" },
  { href: "/comparer", label: "Comparer" },
  { href: "/demander", label: "Demander" },
  { href: "/sources", label: "Données & jobs" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-4 flex items-center gap-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex w-7 h-7 rounded-full items-center justify-center bg-accent text-white text-sm">☀</span>
          Apollon
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${active ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:text-ink"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
