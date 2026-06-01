"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { updateOwner } from "@/lib/actions/patients";
import type { Owner } from "@prisma/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface EditOwnerDialogProps {
  owner: Owner;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditOwnerDialog({ owner, open, onOpenChange }: EditOwnerDialogProps) {
  const t = useTranslations("patients");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isSaving, startSave] = useTransition();

  const [firstName, setFirstName] = useState(owner.firstName);
  const [lastName, setLastName] = useState(owner.lastName);
  const [phone, setPhone] = useState(owner.phone);
  const [phone2, setPhone2] = useState(owner.phone2 ?? "");
  const [email, setEmail] = useState(owner.email ?? "");
  const [postalCode, setPostalCode] = useState(owner.postalCode ?? "");
  const [address, setAddress] = useState(owner.address ?? "");
  const [notes, setNotes] = useState(owner.notes ?? "");

  useEffect(() => {
    if (open) {
      setFirstName(owner.firstName);
      setLastName(owner.lastName);
      setPhone(owner.phone);
      setPhone2(owner.phone2 ?? "");
      setEmail(owner.email ?? "");
      setPostalCode(owner.postalCode ?? "");
      setAddress(owner.address ?? "");
      setNotes(owner.notes ?? "");
    }
  }, [open, owner]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return;
    startSave(async () => {
      const result = await updateOwner(owner.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        phone2: phone2.trim() || undefined,
        email: email.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if ("error" in result) {
        toast.error("Error al actualizar propietario");
        return;
      }
      toast.success(`${result.owner.firstName} ${result.owner.lastName} actualizado`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editOwner")}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4 mt-2" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ownerFirstName">Nombre *</Label>
              <Input
                id="ownerFirstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ownerLastName">Apellido *</Label>
              <Input
                id="ownerLastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ownerPhone">Teléfono *</Label>
              <Input
                id="ownerPhone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ownerPhone2">{t("phone2")}</Label>
              <Input
                id="ownerPhone2"
                type="tel"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ownerPostal">{t("postalCode")}</Label>
              <Input
                id="ownerPostal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ownerAddress">Dirección</Label>
            <Input
              id="ownerAddress"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ownerNotes">Notas</Label>
            <Input
              id="ownerNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground"
              disabled={isSaving || !firstName.trim() || !lastName.trim() || !phone.trim()}
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
