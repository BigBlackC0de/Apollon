import Link from "next/link";
import type { ReactNode } from "react";
import { THEME_BY_ID } from "@/lib/config/themes";

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PartyChip({ id, name, color, size = "sm" }: { id: string; name: string; color: string; size?: "sm" | "md" }) {
  return (
    <Link href={`/partis/${id}`} className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface hover:bg-surface-2 ${size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="font-medium">{name}</span>
    </Link>
  );
}

export function ThemeChip({ id }: { id: string }) {
  const t = THEME_BY_ID[id];
  if (!t) return <span className="text-xs text-ink-3">{id}</span>;
  return (
    <Link href={`/themes/${id}`} className="inline-flex items-center gap-1 text-xs rounded-full bg-surface-2 border border-border px-2 py-0.5 hover:border-accent">
      <span aria-hidden>{t.emoji}</span>
      {t.label}
    </Link>
  );
}

export const fmtStance = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`);

/**
 * Barre divergente : -1 (pôle gauche, rouge) … 0 (gris) … +1 (pôle droit, bleu).
 * Deux repères possibles : déclaré (anneau) et voté (plein).
 */
export function StanceBar({ declared, voted, posts, height = 10, showScale = false, labelLeft, labelRight }: { declared?: number | null; voted?: number | null; posts?: number | null; height?: number; showScale?: boolean; labelLeft?: string; labelRight?: string }) {
  const pos = (v: number) => `${((v + 1) / 2) * 100}%`;
  const dot = (v: number | null | undefined, kind: "declared" | "voted" | "posts") => {
    if (v === null || v === undefined) return null;
    const base = "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full";
    const style = { left: pos(v) };
    if (kind === "declared") return <span className={`${base} border-2 border-ink bg-surface`} style={{ ...style, width: height + 6, height: height + 6 }} title={`Déclaré ${fmtStance(v)}`} />;
    if (kind === "posts") return <span className={`${base} bg-accent`} style={{ ...style, width: height - 2, height: height - 2, opacity: 0.85 }} title={`Tweets ${fmtStance(v)}`} />;
    return <span className={`${base} bg-ink`} style={{ ...style, width: height + 2, height: height + 2 }} title={`Voté ${fmtStance(v)}`} />;
  };
  return (
    <div className="w-full">
      <div className="relative w-full rounded-full" style={{ height, background: "linear-gradient(90deg, var(--left) 0%, var(--neutral) 50%, var(--right) 100%)", opacity: 0.95 }}>
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-surface" />
        {declared !== null && declared !== undefined && voted !== null && voted !== undefined && (
          <span className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-ink/60" style={{ left: pos(Math.min(declared, voted)), width: `calc(${pos(Math.max(declared, voted))} - ${pos(Math.min(declared, voted))})` }} />
        )}
        {dot(posts, "posts")}
        {dot(declared, "declared")}
        {dot(voted, "voted")}
      </div>
      {showScale && (
        <div className="flex justify-between text-[11px] text-ink-3 mt-1">
          <span className="max-w-[45%] truncate" title={labelLeft}>
            ← {labelLeft ?? "-1"}
          </span>
          <span className="max-w-[45%] truncate text-right" title={labelRight}>
            {labelRight ?? "+1"} →
          </span>
        </div>
      )}
    </div>
  );
}

export function StanceLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-ink bg-surface" /> déclaré (programme)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full bg-ink" /> voté (Assemblée)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent" /> tweets
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-6 h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--left), var(--neutral), var(--right))" }} /> axe −1 → +1
      </span>
    </div>
  );
}

const VERDICTS: Record<string, { label: string; cls: string }> = {
  coherent: { label: "Cohérent", cls: "text-good border-good/40 bg-good/10" },
  nuance: { label: "Nuancé", cls: "text-ink-2 border-border bg-surface-2" },
  ecart: { label: "Écart", cls: "text-warn border-warn/40 bg-warn/10" },
  contradiction: { label: "Contradiction", cls: "text-bad border-bad/40 bg-bad/10" },
  insuffisant: { label: "Données insuffisantes", cls: "text-ink-3 border-border bg-surface" },
  confirme: { label: "Confirmé", cls: "text-good border-good/40 bg-good/10" },
  contredit: { label: "Contredit", cls: "text-bad border-bad/40 bg-bad/10" },
  inverifiable: { label: "Invérifiable", cls: "text-ink-3 border-border bg-surface" },
};
export function Verdict({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-xs text-ink-3">non synthétisé</span>;
  const d = VERDICTS[v] ?? { label: v, cls: "" };
  return <span className={`inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 ${d.cls}`}>{d.label}</span>;
}

export function Position({ p }: { p: string | null | undefined }) {
  const map: Record<string, string> = { pour: "text-good", contre: "text-bad", abstention: "text-warn", nonVotant: "text-ink-3" };
  const lbl: Record<string, string> = { pour: "POUR", contre: "CONTRE", abstention: "ABST.", nonVotant: "absent" };
  if (!p) return <span className="text-ink-3 text-xs">—</span>;
  return <span className={`text-xs font-semibold ${map[p] ?? ""}`}>{lbl[p] ?? p}</span>;
}

export function Salience({ s }: { s: number | null | undefined }) {
  if (!s) return null;
  return (
    <span className="text-[11px] text-ink-3" title={`Importance ${s}/5`}>
      {"●".repeat(s)}
      {"○".repeat(5 - s)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border p-6 text-sm text-ink-3 text-center">{children}</div>;
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
export const fmtUsd = (v: number) => `${v.toFixed(2)} $`;
