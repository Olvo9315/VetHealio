"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Eraser, Loader2 } from "lucide-react";
import { submitRemoteSignature } from "@/lib/actions/public-sign";

type Labels = { accept: string; reminders: string; marketing: string; signHere: string; clear: string; submit: string; done: string; error: string; expires: string };

// The customer's side: read, tick, sign with a finger, send. Labels come from the server in the
// document's language (the customer has no app language of their own).
export function RemoteSignForm({ token, text, optional, labels }: { token: string; text: string; optional: boolean; labels: Labels }) {
  const [accept, setAccept] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [signed, setSigned] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isSending, startSend] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  function ctx() {
    const c = canvasRef.current!;
    const g = c.getContext("2d")!;
    if (c.width !== c.clientWidth * 2) {
      c.width = c.clientWidth * 2;
      c.height = c.clientHeight * 2;
      g.scale(2, 2);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.clientWidth, c.clientHeight);
      g.lineWidth = 2.2;
      g.lineCap = "round";
      g.strokeStyle = "#111";
    }
    return g;
  }
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function clear() {
    const c = canvasRef.current!;
    c.width = 0;
    ctx();
    setSigned(false);
  }

  function send() {
    const signature = canvasRef.current!.toDataURL("image/png");
    startSend(async () => {
      const r = await submitRemoteSignature(token, { accept: true, reminders, marketing, signature });
      if ("error" in r) setFailed(true);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-800 p-4 text-sm">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        {labels.done}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-[13px] leading-relaxed whitespace-pre-line max-h-[50vh] overflow-y-auto">
        {text}
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        <span>{labels.accept} *</span>
      </label>
      {optional && (
        <>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
            <span>{labels.reminders}</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>{labels.marketing}</span>
          </label>
        </>
      )}
      <div className="space-y-1">
        <div className="relative rounded-lg border-2 border-dashed border-neutral-400 bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            style={{ height: 180, width: "100%", touchAction: "none", display: "block" }}
            onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} drawing.current = true; last.current = point(e); ctx(); }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return;
              const g = ctx();
              const p = point(e);
              g.beginPath();
              g.moveTo(last.current.x, last.current.y);
              g.lineTo(p.x, p.y);
              g.stroke();
              last.current = p;
              setSigned(true);
            }}
            onPointerUp={() => { drawing.current = false; last.current = null; }}
            onPointerLeave={() => { drawing.current = false; last.current = null; }}
          />
          {!signed && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">{labels.signHere}</p>}
        </div>
        <button type="button" onClick={clear} className="text-xs text-neutral-500 flex items-center gap-1"><Eraser className="w-3.5 h-3.5" />{labels.clear}</button>
      </div>
      {failed && <p className="text-sm text-red-700">{labels.error}</p>}
      <button
        type="button"
        disabled={!accept || !signed || isSending}
        onClick={send}
        className="w-full h-11 rounded-lg bg-neutral-900 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {isSending && <Loader2 className="w-4 h-4 animate-spin" />}
        {labels.submit}
      </button>
      <p className="text-xs text-neutral-500 text-center">{labels.expires}</p>
    </div>
  );
}
