import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

/**
 * Télécharge une URL (binaire) avec cache disque.
 * maxAgeHours : au-delà, on retélécharge (les dumps AN sont mis à jour quotidiennement).
 */
export async function fetchCached(url: string, opts?: { maxAgeHours?: number; log?: (m: string) => void }): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  const ext = path.extname(new URL(url).pathname) || ".bin";
  const file = path.join(CACHE_DIR, `${key}${ext}`);
  const maxAge = (opts?.maxAgeHours ?? 20) * 3600 * 1000;
  if (fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < maxAge) {
      opts?.log?.(`Cache disque utilisé pour ${url} (${(fs.statSync(file).size / 1e6).toFixed(1)} Mo)`);
      return fs.readFileSync(file);
    }
  }
  opts?.log?.(`Téléchargement ${url} …`);
  const res = await fetch(url, { headers: { "user-agent": "Apollon/0.1 (+analyse politique citoyenne)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  opts?.log?.(`Reçu ${(buf.length / 1e6).toFixed(1)} Mo`);
  return buf;
}
