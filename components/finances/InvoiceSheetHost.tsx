"use client";

import { useEffect, useState } from "react";
import { getInvoiceById, type InvoiceFull } from "@/lib/actions/invoices";
import { getServicesFlat, type ServiceFlat } from "@/lib/actions/services";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import { InvoiceDialog } from "./InvoiceDialog";

// Opens one albarán by id (payments, tickets, editing) from places that don't manage bills
// themselves: a presupuesto, the appointment menu
export function InvoiceSheetHost({ invoiceId, onClose, onChanged }: { invoiceId: string | null; onClose: () => void; onChanged?: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceFull | null>(null);
  const [editing, setEditing] = useState(false);
  const [services, setServices] = useState<ServiceFlat[] | null>(null);

  useEffect(() => {
    if (!invoiceId) { setInvoice(null); return; }
    getInvoiceById(invoiceId).then((inv) => (inv ? setInvoice(inv) : onClose()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  if (!invoice) return null;
  return (
    <>
      <InvoiceDetailSheet
        open={!editing}
        onOpenChange={(v) => { if (!v && !editing) { setInvoice(null); onClose(); } }}
        invoice={invoice}
        onUpdated={(inv) => { setInvoice(inv); onChanged?.(); }}
        onDeleted={() => { setInvoice(null); onChanged?.(); onClose(); }}
        onEdit={() => { setEditing(true); if (!services) getServicesFlat().then(setServices); }}
      />
      {editing && services && (
        <InvoiceDialog
          open
          onOpenChange={(v) => { if (!v) setEditing(false); }}
          invoice={invoice}
          services={services}
          onSaved={(inv) => { setInvoice(inv); setEditing(false); onChanged?.(); }}
        />
      )}
    </>
  );
}
