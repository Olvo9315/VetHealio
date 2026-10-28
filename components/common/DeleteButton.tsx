"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteButtonProps {
  confirmText: string;
  onDelete: () => Promise<void>;
}

// Footer "Delete" of an edit dialog; asks first
export function DeleteButton({ confirmText, onDelete }: DeleteButtonProps) {
  const tc = useTranslations("common");
  const [isDeleting, startDelete] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      aria-label={tc("delete")}
      title={tc("delete")}
      disabled={isDeleting}
      onClick={() => {
        if (!confirm(confirmText)) return;
        startDelete(onDelete);
      }}
    >
      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
