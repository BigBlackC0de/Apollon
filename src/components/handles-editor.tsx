"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function HandlesEditor({ partyId, handles }: { partyId: string; handles: string[] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(handles.join(", "));
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const save = async () => {
    setBusy(true);
    await fetch(`/api/parties/${partyId}/handles`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ handles: value.split(/[\s,]+/).map((h) => h.replace(/^@/, "")).filter(Boolean) }) });
    setBusy(false);
    setOpen(false);
    router.refresh();
  };
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-ink-2 underline">
        comptes X suivis ({handles.length})
      </button>
    );
  return (
    <div className="flex gap-1 items-center">
      <input value={value} onChange={(e) => setValue(e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-surface w-64" placeholder="handle1, handle2" />
      <button onClick={save} disabled={busy} className="text-xs rounded bg-ink text-bg px-2 py-1">
        OK
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-ink-3">
        ✕
      </button>
    </div>
  );
}
