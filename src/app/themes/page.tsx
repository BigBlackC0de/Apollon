import Link from "next/link";
import { themeStats } from "@/lib/queries";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ThemesPage() {
  const themes = themeStats();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Les thèmes</h1>
      <p className="text-sm text-ink-2 max-w-3xl">
        Chaque thème est un axe orienté de −1 à +1. L&apos;orientation est une convention pour comparer programmes, votes et tweets sur la même échelle ; elle ne dit pas qui a raison.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {themes.map((t) => (
          <Card key={t.id}>
            <Link href={`/themes/${t.id}`} className="font-semibold hover:underline">
              {t.emoji} {t.label}
            </Link>
            <div className="text-xs text-ink-3 mt-0.5">
              {t.n} scrutins de fond · {t.major} majeurs · groupe {t.group === "eco" ? "économique (axe horizontal)" : t.group === "societal" ? "sociétal (axe vertical)" : "hors boussole"}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div className="rounded-lg p-2 border border-left/30 bg-left/5">
                <div className="font-medium text-left">−1</div>
                {t.poleLeft}
              </div>
              <div className="rounded-lg p-2 border border-right/30 bg-right/5">
                <div className="font-medium text-right">+1</div>
                {t.poleRight}
              </div>
            </div>
            <p className="text-xs text-ink-3 mt-2">{t.scope}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
