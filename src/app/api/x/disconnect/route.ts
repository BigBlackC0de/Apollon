import { redirect } from "next/navigation";
import { disconnectX } from "@/lib/x/client";

export async function POST() {
  disconnectX();
  redirect("/sources?x=" + encodeURIComponent("Compte X déconnecté."));
}
