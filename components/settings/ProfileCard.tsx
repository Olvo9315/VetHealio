"use client";

import { useTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { UserProfile } from "@/lib/actions/settings";
import { updateProfile } from "@/lib/actions/settings";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  VETERINARIAN: "Veterinario",
  RECEPTIONIST: "Recepcionista",
  ASSISTANT: "Asistente",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary",
  VETERINARIAN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  RECEPTIONIST: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  ASSISTANT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const schema = z.object({
  name: z.string().min(1, "Requerido").max(100),
  phone: z.string().max(20).optional().or(z.literal("")),
  avatar: z.string().url("URL inválida").optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface ProfileCardProps {
  user: UserProfile;
}

export function ProfileCard({ user }: ProfileCardProps) {
  const [isSaving, startSave] = useTransition();
  const [avatarPreview, setAvatarPreview] = useState(user.avatar ?? "");

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      phone: user.phone ?? "",
      avatar: user.avatar ?? "",
    },
  });

  function handleSubmit(data: FormData) {
    startSave(async () => {
      const result = await updateProfile(user.id, data);
      if ("error" in result) {
        toast.error("Error al guardar el perfil");
        return;
      }
      toast.success("Perfil actualizado");
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <User className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Perfil</h2>
      </div>

      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <Avatar className="w-16 h-16 shrink-0">
          <AvatarImage src={avatarPreview || undefined} />
          <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium text-sm">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <span className={cn("inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full", ROLE_COLORS[user.role] ?? "bg-muted text-muted-foreground")}>
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre completo *</Label>
          <Input id="name" {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <Label>Correo electrónico</Label>
          <Input value={user.email} disabled className="bg-muted text-muted-foreground" />
          <p className="text-xs text-muted-foreground">El correo no puede modificarse.</p>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" type="tel" placeholder="+34 600 000 000" {...form.register("phone")} />
        </div>

        {/* Avatar URL */}
        <div className="space-y-1.5">
          <Label htmlFor="avatar">URL de foto de perfil</Label>
          <Input
            id="avatar"
            type="url"
            placeholder="https://..."
            {...form.register("avatar")}
            onChange={(e) => {
              form.setValue("avatar", e.target.value);
              setAvatarPreview(e.target.value);
            }}
          />
          {form.formState.errors.avatar && (
            <p className="text-xs text-destructive">{form.formState.errors.avatar.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Guardar perfil
        </Button>
      </form>
    </div>
  );
}
