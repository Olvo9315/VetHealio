"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface TopBarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  title: string;
}

export function TopBar({ user, title }: TopBarProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-border bg-background shrink-0">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
          <Avatar className="w-8 h-8 cursor-pointer">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials ?? "U"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => router.push("/settings")}
          >
            <Settings className="w-4 h-4 mr-2" />
            {t("settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-destructive data-[highlighted]:text-destructive cursor-pointer"
            variant="destructive"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
