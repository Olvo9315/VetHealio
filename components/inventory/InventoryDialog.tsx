"use client";

import { useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { InventoryItem } from "@/lib/actions/inventory";
import { createInventoryItem, updateInventoryItem } from "@/lib/actions/inventory";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

export const CATEGORIES = [
  "Medicamentos",
  "Vacunas",
  "Material quirúrgico",
  "Desinfectantes",
  "Alimentación",
  "Suplementos",
  "Equipamiento",
  "Otros",
] as const;

export const UNITS = [
  "unidades",
  "comprimidos",
  "viales",
  "ml",
  "mg",
  "g",
  "kg",
  "jeringas",
  "cajas",
  "bolsas",
  "litros",
] as const;

const schema = z.object({
  name: z.string().min(1, "Requerido").max(100),
  category: z.string().min(1, "Requerido"),
  quantity: z.coerce.number().min(0, "Debe ser ≥ 0"),
  unit: z.string().min(1, "Requerido"),
  minStock: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().positive().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  supplier: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface InventoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: InventoryItem;
  onSaved: (item: InventoryItem) => void;
}

export function InventoryDialog({ open, onOpenChange, item, onSaved }: InventoryDialogProps) {
  const isEdit = !!item;
  const [isSaving, startSave] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: item
      ? {
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          minStock: item.minStock,
          unitCost: item.unitCost ?? "",
          expiryDate: item.expiryDate ? format(new Date(item.expiryDate), "yyyy-MM-dd") : "",
          supplier: item.supplier ?? "",
          notes: item.notes ?? "",
        }
      : {
          name: "",
          category: "Medicamentos",
          quantity: 0,
          unit: "unidades",
          minStock: 0,
          unitCost: "",
          expiryDate: "",
          supplier: "",
          notes: "",
        },
  });

  const watchCategory = form.watch("category");
  const watchUnit = form.watch("unit");

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateInventoryItem(item.id, data);
        if ("error" in result) { toast.error("Error al actualizar"); return; }
        toast.success("Artículo actualizado");
        onSaved(result.item);
      } else {
        const result = await createInventoryItem(data);
        if ("error" in result) { toast.error("Error al crear artículo"); return; }
        toast.success("Artículo creado");
        onSaved(result.item);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar artículo" : "Nuevo artículo"}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (formRef.current) {
              formRef.current
                .querySelectorAll<HTMLInputElement>("input[name], textarea[name]")
                .forEach((el) => {
                  if (el.value) {
                    form.setValue(el.name as keyof FormData, el.value, { shouldDirty: true });
                  }
                });
            }
            (form.handleSubmit(handleSubmit as Parameters<typeof form.handleSubmit>[0]))();
          }}
        >
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" placeholder="Ej. Amoxicilina 250mg" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select
                value={watchCategory}
                onValueChange={(v) => form.setValue("category", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {watchCategory || "Medicamentos"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unidad *</Label>
              <Select
                value={watchUnit}
                onValueChange={(v) => form.setValue("unit", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {watchUnit || "unidades"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Stock */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Cantidad actual *</Label>
                <Input id="quantity" type="number" min="0" step="0.1" {...form.register("quantity")} />
                {form.formState.errors.quantity && (
                  <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minStock">Stock mínimo</Label>
                <Input id="minStock" type="number" min="0" step="0.1" {...form.register("minStock")} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Cost + Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unitCost">Costo unitario (€)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                <Input id="unitCost" type="number" min="0" step="0.01" placeholder="0.00" className="pl-6" {...form.register("unitCost")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Fecha de vencimiento</Label>
              <Input id="expiryDate" type="date" {...form.register("expiryDate")} />
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Proveedor</Label>
            <Input id="supplier" placeholder="Nombre del proveedor" {...form.register("supplier")} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} placeholder="Observaciones..." {...form.register("notes")} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear artículo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
