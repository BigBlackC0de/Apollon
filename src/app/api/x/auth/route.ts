import { redirect } from "next/navigation";
import { buildAuthorizeUrl } from "@/lib/x/client";

export async function GET() {
  let url: string;
  try {
    url = buildAuthorizeUrl().url;
  } catch (e) {
    redirect(`/sources?x=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(url);
}
