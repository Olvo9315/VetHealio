"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DoorOpen, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Room } from "@/lib/actions/rooms";
import { createRoom, deleteRoom, updateRoom } from "@/lib/actions/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Distinct from the service palette so a room label reads well on a coloured event
export const ROOM_COLORS = [
  "#0F172A", "#1D4ED8", "#7C3AED", "#BE185D", "#B45309",
  "#0E7490", "#15803D", "#B91C1C", "#4338CA", "#A16207",
];

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROOM_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          aria-label={c}
          className={cn("w-5 h-5 rounded-full border-2 transition-transform hover:scale-110", value === c ? "border-foreground" : "border-transparent")}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function RoomsCard({ rooms }: { rooms: Room[] }) {
  const t = useTranslations("rooms");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ROOM_COLORS[1]);

  function run(action: () => Promise<unknown>, success?: string) {
    startTransition(async () => {
      try {
        await action();
        if (success) toast.success(success);
        router.refresh();
      } catch {
        toast.error(t("errorSave"));
      }
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await createRoom({ name: newName.trim(), color: newColor });
      setNewName("");
    }, t("saved"));
  }

  const active = rooms.filter((r) => r.isActive);
  const archived = rooms.filter((r) => !r.isActive);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <DoorOpen className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>

      <ul className="space-y-3">
        {active.map((room) => (
          <li key={room.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: room.color }} />
              <Input
                defaultValue={room.name}
                className="h-8"
                disabled={isPending}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== room.name) run(() => updateRoom(room.id, { name }), t("saved"));
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive shrink-0"
                disabled={isPending}
                title={t("delete")}
                onClick={() => {
                  if (!confirm(t("deleteConfirm", { name: room.name }))) return;
                  run(async () => {
                    const result = await deleteRoom(room.id);
                    toast.success(result.archived ? t("archived") : t("deleted"));
                  });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="pl-5">
              <ColorPicker value={room.color} disabled={isPending} onChange={(color) => run(() => updateRoom(room.id, { color }))} />
            </div>
          </li>
        ))}
        {active.length === 0 && <li className="text-sm text-muted-foreground">{t("none")}</li>}
      </ul>

      <form onSubmit={add} className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("namePlaceholder")} className="h-8" />
          <Button type="submit" size="sm" disabled={isPending || !newName.trim()}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            {t("add")}
          </Button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
      </form>

      {archived.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("archivedTitle")}</p>
          {archived.map((room) => (
            <div key={room.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
              <span className="flex-1">{room.name}</span>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => run(() => updateRoom(room.id, { isActive: true }), t("saved"))}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                {t("restore")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
