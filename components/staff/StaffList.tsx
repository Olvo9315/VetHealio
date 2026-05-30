"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NewStaffDialog } from "./NewStaffDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@prisma/client";

type StaffItem = {
  id: string;
  isActive: boolean;
  specialization: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    avatar: string | null;
    phone: string | null;
  };
};

interface StaffListProps {
  staff: StaffItem[];
  isAdmin: boolean;
}

const ROLE_COLORS: Record<Role, string> = {
  ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  VETERINARIAN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  RECEPTIONIST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ASSISTANT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const SPEC_KEYS = [
  "generalPractice", "smallAnimals", "largeAnimals", "exoticAnimals",
  "surgery", "internalMedicine", "cardiology", "gastroenterology", "dermatology",
  "oncology", "ophthalmology", "neurology", "orthopedics", "emergency",
  "dentistry", "reproduction", "anesthesia", "radiology", "nutrition",
  "rehabilitation", "preventiveMedicine",
] as const;

export function StaffList({ staff, isAdmin }: StaffListProps) {
  const t = useTranslations("staff");
  const router = useRouter();

  function translateSpec(spec: string | null): string {
    if (!spec) return "—";
    return SPEC_KEYS.includes(spec as typeof SPEC_KEYS[number])
      ? t(`spec_${spec}` as Parameters<typeof t>[0])
      : spec;
  }
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [activeFilter, setActiveFilter] = useState<string>("true");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = staff.filter((s) => {
    const matchSearch =
      !search ||
      s.user.name.toLowerCase().includes(search.toLowerCase()) ||
      s.user.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.specialization ?? "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "ALL" || s.user.role === roleFilter;
    const matchActive =
      activeFilter === "all" ||
      (activeFilter === "true" ? s.isActive : !s.isActive);
    return matchSearch && matchRole && matchActive;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("title") + "..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "ALL")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue>
              {roleFilter === "ALL" ? t("all") : ({ ADMIN: t("roleAdmin"), VETERINARIAN: t("roleVeterinarian"), RECEPTIONIST: t("roleReceptionist"), ASSISTANT: t("roleAssistant") } as Record<string, string>)[roleFilter]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("all")}</SelectItem>
            <SelectItem value="VETERINARIAN">{t("roleVeterinarian")}</SelectItem>
            <SelectItem value="RECEPTIONIST">{t("roleReceptionist")}</SelectItem>
            <SelectItem value="ASSISTANT">{t("roleAssistant")}</SelectItem>
            <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v ?? "true")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue>
              {{ true: t("active"), false: t("inactive"), all: t("all") }[activeFilter]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t("active")}</SelectItem>
            <SelectItem value="false">{t("inactive")}</SelectItem>
            <SelectItem value="all">{t("all")}</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("new")}
          </Button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{t("specialization")}</TableHead>
              <TableHead>{t("phone")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <Users className="mx-auto h-8 w-8 mb-2 opacity-30" />
                  {t("noStaff")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/staff/${s.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        {s.user.avatar && <AvatarImage src={s.user.avatar} />}
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {s.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{s.user.name}</p>
                        <p className="text-xs text-muted-foreground">{s.user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[s.user.role])}>
                      {({ ADMIN: t("roleAdmin"), VETERINARIAN: t("roleVeterinarian"), RECEPTIONIST: t("roleReceptionist"), ASSISTANT: t("roleAssistant") })[s.user.role]}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{translateSpec(s.specialization)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.user.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "default" : "secondary"}>
                      {s.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="mx-auto h-8 w-8 mb-2 opacity-30" />
            {t("noStaff")}
          </div>
        ) : (
          filtered.map((s) => (
            <Link key={s.id} href={`/staff/${s.id}`} className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {s.user.avatar && <AvatarImage src={s.user.avatar} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {s.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.user.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ROLE_COLORS[s.user.role])}>
                    {({ ADMIN: t("roleAdmin"), VETERINARIAN: t("roleVeterinarian"), RECEPTIONIST: t("roleReceptionist"), ASSISTANT: t("roleAssistant") })[s.user.role]}
                  </span>
                  <Badge variant={s.isActive ? "default" : "secondary"} className="text-[10px]">
                    {s.isActive ? t("active") : t("inactive")}
                  </Badge>
                </div>
              </div>
              {s.specialization && (
                <p className="mt-2 text-xs text-muted-foreground">{translateSpec(s.specialization)}</p>
              )}
            </Link>
          ))
        )}
      </div>

      <NewStaffDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
