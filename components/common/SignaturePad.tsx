"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = { toDataUrl: () => string | null; clear: () => void };

// Draw a signature with a finger, stylus or mouse. Always black on white so it prints well.
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void; height?: number }>(
  function SignaturePad({ onChange, height = 180 }, ref) {
    const t = useTranslations("consent");
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    function setup() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    }

    useEffect(setup, [height]); // eslint-disable-line react-hooks/exhaustive-deps

    function clear() {
      setup();
      setEmpty(true);
      onChange?.(true);
    }

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (empty ? null : canvasRef.current?.toDataURL("image/png") ?? null),
      clear,
    }));

    function point(e: React.PointerEvent<HTMLCanvasElement>) {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    return (
      <div className="space-y-1">
        <div className="relative rounded-lg border-2 border-dashed border-muted-foreground/40 bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            style={{ height, width: "100%", touchAction: "none", display: "block" }}
            onPointerDown={(e) => {
              // Keep receiving moves when the finger leaves the box; not every input supports capture
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
              drawing.current = true;
              last.current = point(e);
            }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return;
              const ctx = canvasRef.current!.getContext("2d")!;
              const p = point(e);
              ctx.beginPath();
              ctx.moveTo(last.current.x, last.current.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              last.current = p;
              if (empty) { setEmpty(false); onChange?.(false); }
            }}
            onPointerUp={() => { drawing.current = false; last.current = null; }}
            onPointerLeave={() => { drawing.current = false; last.current = null; }}
          />
          {empty && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">{t("signHere")}</p>
          )}
          <div className="pointer-events-none absolute left-6 right-6 bottom-8 border-b border-neutral-300" />
        </div>
        <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Eraser className="w-3.5 h-3.5" />
          {t("clearSignature")}
        </button>
      </div>
    );
  }
);
