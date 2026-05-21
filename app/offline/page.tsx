"use client";

import { WifiOff, RotateCcw, Heart } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      {/* Logo */}
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-8">
        <Heart className="w-8 h-8 text-primary-foreground" />
      </div>

      {/* Offline icon */}
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <WifiOff className="w-10 h-10 text-muted-foreground" />
      </div>

      <h1 className="text-xl font-bold mb-2">Sin conexión</h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs leading-relaxed">
        Comprueba tu conexión a internet y vuelve a intentarlo.
      </p>

      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm active:scale-95 transition-transform"
      >
        <RotateCcw className="w-4 h-4" />
        Reintentar
      </button>

      <p className="mt-12 text-xs text-muted-foreground">VetHealio</p>
    </div>
  );
}
