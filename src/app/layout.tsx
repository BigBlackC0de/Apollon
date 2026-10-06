import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Apollon — ce que les partis disent, ce qu'ils votent",
  description: "Analyse indépendante des partis politiques français : programmes, votes au Parlement et prises de parole, confrontés par Claude.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-border text-xs text-ink-3 px-4 py-4 text-center">
          Sources : open data de l&apos;Assemblée nationale, NosParlementaires (data.senat.fr), sites officiels des partis, X. Analyse par Claude (Anthropic). Les positions sont des estimations documentées, pas des vérités — vérifiez toujours les preuves citées.
        </footer>
      </body>
    </html>
  );
}
