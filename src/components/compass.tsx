"use client";
import { useState } from "react";
import Link from "next/link";

export interface CompassParty {
  id: string;
  shortName: string;
  name: string;
  color: string;
  declared: { x: number | null; y: number | null };
  voted: { x: number | null; y: number | null };
}

/**
 * Boussole politique : x = axe économique (−1 interventionniste … +1 libéral),
 * y = axe sociétal (−1 ouverture/progressisme … +1 ordre/souveraineté).
 * Chaque parti : anneau = position déclarée (programme), disque = position votée.
 * Un trait relie les deux : c'est l'écart « dire / faire ».
 */
export function Compass({ parties, size = 560 }: { parties: CompassParty[]; size?: number }) {
  const [mode, setMode] = useState<"both" | "declared" | "voted">("both");
  const [hover, setHover] = useState<string | null>(null);
  const pad = 36;
  const W = size;
  const H = size;
  const sx = (v: number) => pad + ((v + 1) / 2) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v + 1) / 2) * (H - 2 * pad);
  const has = (p: { x: number | null; y: number | null }) => p.x !== null && p.y !== null;
  const shown = parties.filter((p) => has(p.declared) || has(p.voted));

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        {(["both", "voted", "declared"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-full border ${mode === m ? "bg-ink text-bg border-ink" : "border-border text-ink-2 hover:border-ink"}`}>
            {m === "both" ? "Dire et faire" : m === "voted" ? "Votes seulement" : "Programmes seulement"}
          </button>
        ))}
        <span className="ml-auto text-ink-3">anneau = programme · disque = votes · trait = écart</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[640px] mx-auto block" role="img" aria-label="Boussole politique des partis">
        <defs>
          <clipPath id="plot">
            <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
          </clipPath>
        </defs>
        {/* quadrants */}
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="var(--surface-2)" rx={8} />
        {[-0.5, 0.5].map((v) => (
          <g key={v}>
            <line x1={sx(v)} y1={pad} x2={sx(v)} y2={H - pad} stroke="var(--border)" strokeWidth={1} />
            <line x1={pad} y1={sy(v)} x2={W - pad} y2={sy(v)} stroke="var(--border)" strokeWidth={1} />
          </g>
        ))}
        <line x1={sx(0)} y1={pad} x2={sx(0)} y2={H - pad} stroke="var(--ink-3)" strokeWidth={1} />
        <line x1={pad} y1={sy(0)} x2={W - pad} y2={sy(0)} stroke="var(--ink-3)" strokeWidth={1} />
        {/* axis labels */}
        <text x={pad + 4} y={sy(0) - 6} fontSize={11} fill="var(--ink-3)">
          ← État, redistribution
        </text>
        <text x={W - pad - 4} y={sy(0) - 6} fontSize={11} fill="var(--ink-3)" textAnchor="end">
          Marché, baisse d&apos;impôts →
        </text>
        <text x={sx(0) + 6} y={pad + 14} fontSize={11} fill="var(--ink-3)">
          ↑ Ordre, souveraineté, restriction
        </text>
        <text x={sx(0) + 6} y={H - pad - 6} fontSize={11} fill="var(--ink-3)">
          ↓ Ouverture, progressisme, Europe
        </text>
        <g clipPath="url(#plot)">
          {shown.map((p) => {
            const d = has(p.declared) && mode !== "voted";
            const v = has(p.voted) && mode !== "declared";
            const dim = hover && hover !== p.id;
            return (
              <g key={p.id} opacity={dim ? 0.25 : 1} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} style={{ transition: "opacity .15s" }}>
                {d && v && <line x1={sx(p.declared.x!)} y1={sy(p.declared.y!)} x2={sx(p.voted.x!)} y2={sy(p.voted.y!)} stroke={p.color} strokeWidth={2} strokeOpacity={0.7} />}
                {d && <circle cx={sx(p.declared.x!)} cy={sy(p.declared.y!)} r={7} fill="var(--surface)" stroke={p.color} strokeWidth={2.5} />}
                {v && <circle cx={sx(p.voted.x!)} cy={sy(p.voted.y!)} r={7} fill={p.color} stroke="var(--surface)" strokeWidth={2} />}
                {(() => {
                  const anchor = v ? p.voted : p.declared;
                  return (
                    <text x={sx(anchor.x!) + 10} y={sy(anchor.y!) + 4} fontSize={12} fontWeight={600} fill="var(--ink)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">
                      {p.shortName}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (() => {
        const p = shown.find((x) => x.id === hover)!;
        const f = (n: number | null) => (n === null ? "—" : (n > 0 ? "+" : "") + n.toFixed(2));
        return (
          <div className="text-xs text-ink-2 mt-1 text-center">
            <Link href={`/partis/${p.id}`} className="font-medium text-ink underline">
              {p.name}
            </Link>{" "}
            — programme ({f(p.declared.x)}, {f(p.declared.y)}) · votes ({f(p.voted.x)}, {f(p.voted.y)})
          </div>
        );
      })()}
      {!shown.length && <p className="text-sm text-ink-3 text-center mt-2">Aucune position calculée : lancez la classification des scrutins et l&apos;analyse des programmes depuis « Données &amp; jobs ».</p>}
    </div>
  );
}
