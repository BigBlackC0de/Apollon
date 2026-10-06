import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { exchangeCode } from "@/lib/x/client";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  let msg = "Compte X connecté ✔";
  if (err || !code || !state) msg = `Connexion X refusée : ${err ?? "paramètres manquants"}`;
  else {
    try {
      await exchangeCode(code, state);
    } catch (e) {
      msg = `Connexion X échouée : ${(e as Error).message}`;
    }
  }
  redirect(`/sources?x=${encodeURIComponent(msg)}`);
}
