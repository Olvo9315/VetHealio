"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteService } from "@/lib/actions/services";
import type { ServiceNode } from "@/lib/actions/services";
import { ServiceDialog } from "./ServiceDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ServicesTreeNodeProps {
  node: ServiceNode;
  depth: number;
}

export function ServicesTreeNode({ node, depth }: ServicesTreeNodeProps) {
  const t = useTranslations("services");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const hasChildren = (node.children?.length ?? 0) > 0;
  const canAddChild = depth < 2;
  const indentClass = depth === 0 ? "" : depth === 1 ? "ml-6" : "ml-12";

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteService(node.id);
      if (result?.error === "has_children") { toast.error(t("hasChildren")); return; }
      if (result?.error === "in_use") { toast.error(t("inUse")); return; }
      if (result?.error) { toast.error(t("errorDelete")); return; }
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  return (
    <div className={indentClass}>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 group",
          depth === 0 && "border border-border bg-card mb-1"
        )}
      >
        {/* Expand/collapse */}
        <button
          type="button"
          className="shrink-0 w-4 h-4 text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <span className="w-4 h-4 block" />
          )}
        </button>

        {/* Color dot (root only) */}
        {depth === 0 && node.color && (
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: node.color }}
          />
        )}

        {/* Name */}
        <span className={cn("flex-1 text-sm", depth === 0 ? "font-semibold" : "font-medium")}>
          {node.name}
        </span>

        {/* Price badge */}
        {node.price != null && (
          <Badge variant="secondary" className="text-xs font-mono">
            {node.price.toFixed(2)}€
          </Badge>
        )}

        {/* Actions (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddChild && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setAddOpen(true)}
              title={t("addChild")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEditOpen(true)}
            title={t("edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isPending}
            title={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-0.5 space-y-0.5">
          {(node.children ?? []).map((child) => (
            <ServicesTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ServiceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        parentId={node.id}
        parentName={node.name}
        depth={depth + 1}
      />
      {editOpen && (
        <ServiceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editNode={node}
          parentId={node.parentId}
          depth={depth}
        />
      )}
    </div>
  );
}
