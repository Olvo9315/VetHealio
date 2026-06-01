"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceNode } from "@/lib/actions/services";
import { ServicesTreeNode } from "./ServicesTreeNode";
import { ServiceDialog } from "./ServiceDialog";
import { Button } from "@/components/ui/button";
import { Plus, Scissors } from "lucide-react";

interface ServicesManagerProps {
  initialTree: ServiceNode[];
}

export function ServicesManager({ initialTree }: ServicesManagerProps) {
  const t = useTranslations("services");
  const [addRootOpen, setAddRootOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {initialTree.length} {initialTree.length === 1 ? "categoría" : "categorías"}
        </p>
        <Button size="sm" onClick={() => setAddRootOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newRoot")}
        </Button>
      </div>

      {initialTree.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Scissors className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{t("noServices")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialTree.map((node) => (
            <ServicesTreeNode key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}

      <ServiceDialog
        open={addRootOpen}
        onOpenChange={setAddRootOpen}
        parentId={null}
        depth={0}
      />
    </div>
  );
}
