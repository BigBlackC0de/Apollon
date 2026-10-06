import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, nowIso, schema } from "../db";

/**
 * Client X (Twitter) API v2.
 *  - Mode "compte connecté" : OAuth 2.0 PKCE (le compte X de l'utilisateur autorise l'app).
 *  - Mode "app only"        : X_BEARER_TOKEN.
 * X facture à l'usage depuis février 2026 (~0,005 $ / tweet lu) : chaque appel est compté.
 */

const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "users.read", "offline.access"];

export function getSetting(key: string): string | null {
  return getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null;
}
export function setSetting(key: string, value: string) {
  getDb()
    .insert(schema.settings)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: nowIso() } })
    .run();
}
export function deleteSetting(key: string) {
  getDb().delete(schema.settings).where(eq(schema.settings.key, key)).run();
}

export function xConfigured(): { oauth: boolean; bearer: boolean; connected: boolean } {
  return {
    oauth: !!process.env.X_CLIENT_ID,
    bearer: !!process.env.X_BEARER_TOKEN,
    connected: !!getSetting("x:access_token"),
  };
}

/* ---- OAuth 2.0 PKCE ---- */

export function buildAuthorizeUrl(): { url: string; state: string } {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID manquant dans .env");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  setSetting("x:pkce_verifier", verifier);
  setSetting("x:oauth_state", state);
  const redirect = `${process.env.APOLLON_BASE_URL ?? "http://localhost:3000"}/api/x/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { url: `https://x.com/i/oauth2/authorize?${params}`, state };
}

export async function exchangeCode(code: string, state: string) {
  if (state !== getSetting("x:oauth_state")) throw new Error("state OAuth invalide");
  const verifier = getSetting("x:pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier absent");
  const redirect = `${process.env.APOLLON_BASE_URL ?? "http://localhost:3000"}/api/x/callback`;
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier, client_id: process.env.X_CLIENT_ID! });
  const res = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: tokenHeaders(), body });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Échange du code : ${json.error_description ?? json.error ?? res.status}`);
  saveTokens(json);
}

function tokenHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (process.env.X_CLIENT_SECRET) {
    h.authorization = `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`;
  }
  return h;
}

function saveTokens(j: { access_token?: string; refresh_token?: string; expires_in?: number }) {
  setSetting("x:access_token", j.access_token!);
  if (j.refresh_token) setSetting("x:refresh_token", j.refresh_token);
  setSetting("x:expires_at", String(Date.now() + (j.expires_in ?? 7200) * 1000 - 60_000));
}

async function refreshIfNeeded() {
  const exp = Number(getSetting("x:expires_at") ?? 0);
  if (Date.now() < exp) return;
  const refresh = getSetting("x:refresh_token");
  if (!refresh) return;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: process.env.X_CLIENT_ID! });
  const res = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: tokenHeaders(), body });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (res.ok && json.access_token) saveTokens(json);
}

export function disconnectX() {
  for (const k of ["x:access_token", "x:refresh_token", "x:expires_at", "x:pkce_verifier", "x:oauth_state"]) deleteSetting(k);
}

/* ---- Appels API ---- */

async function authHeader(): Promise<string> {
  if (getSetting("x:access_token")) {
    await refreshIfNeeded();
    return `Bearer ${getSetting("x:access_token")}`;
  }
  if (process.env.X_BEARER_TOKEN) return `Bearer ${process.env.X_BEARER_TOKEN}`;
  throw new Error("X non configuré : connectez votre compte X ou renseignez X_BEARER_TOKEN");
}

async function xGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { authorization: await authHeader() } });
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-rate-limit-reset") ?? 0) * 1000;
    throw new Error(`Limite de débit X atteinte (réinitialisation ${reset ? new Date(reset).toLocaleTimeString("fr-FR") : "?"})`);
  }
  const json = (await res.json()) as T & { errors?: { message: string }[]; title?: string; detail?: string };
  if (!res.ok) throw new Error(`X API ${res.status} : ${json.detail ?? json.title ?? json.errors?.[0]?.message ?? "erreur"}`);
  return json;
}

export interface XUser {
  id: string;
  name: string;
  username: string;
}
export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  lang?: string;
  public_metrics?: { like_count: number; retweet_count: number; reply_count: number; impression_count?: number };
  referenced_tweets?: { type: string; id: string }[];
}

export async function getUserByUsername(username: string): Promise<XUser> {
  const cached = getSetting(`x:user:${username.toLowerCase()}`);
  if (cached) return JSON.parse(cached) as XUser;
  const r = await xGet<{ data: XUser }>(`/users/by/username/${encodeURIComponent(username)}`, { "user.fields": "id,name,username" });
  setSetting(`x:user:${username.toLowerCase()}`, JSON.stringify(r.data));
  return r.data;
}

export async function getUserTweets(userId: string, opts: { sinceId?: string; maxResults?: number }): Promise<XTweet[]> {
  const params: Record<string, string> = {
    max_results: String(Math.min(100, Math.max(5, opts.maxResults ?? 100))),
    "tweet.fields": "id,text,created_at,lang,public_metrics,referenced_tweets",
    exclude: "retweets,replies",
  };
  if (opts.sinceId) params.since_id = opts.sinceId;
  const r = await xGet<{ data?: XTweet[] }>(`/users/${userId}/tweets`, params);
  return r.data ?? [];
}
