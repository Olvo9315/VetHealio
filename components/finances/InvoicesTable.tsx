"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import { useTranslations } from "next-intl";
import type { InvoiceFull } from "@/lib/actions/invoices";
import { getInvoices } from "@/lib/actions/invoices";
import type { InvoiceStatus } from "@prisma/client";
import { InvoiceDialog } from "./InvoiceDialog";
import { InvoiceDetailSheet } from "./InvoiceDetailSheet";
import type { ServiceFlat } from "@/lib/actions/services";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Loader2, Receipt, ChevronRight, Download } from "lucide-react";
import { cn, formatInvoiceId } from "@/lib/utils";
import { useCan } from "@/components/layout/PermissionsProvider";

const STATUS_TABS: { value: InvoiceStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "all" },
  { value: "PENDING", label: "pending" },
  { value: "PAID", label: "paid" },
  { value: "CANCELLED", label: "cancelled" },
];

const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
  PENDING:   { label: "pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  PAID:      { label: "paid",      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  CANCELLED: { label: "cancelled", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

type FinanceT = (key: string, values?: Record<string, string | number>) => string;

function exportCSV(invoices: InvoiceFull[], t: FinanceT) {
  const methodLabel: Record<string, string> = { CASH: t("cash"), CARD: t("card"), TRANSFER: t("transfer") };
  const rows = [
    [t("date"), t("patient"), t("owner"), t("appointment"), t("status"), t("paymentMethod"), t("total")],
    ...invoices.map((inv) => [
      format(new Date(inv.createdAt), "dd/MM/yyyy"),
      inv.pet.name,
      `${inv.pet.owner.firstName} ${inv.pet.owner.lastName}`,
      inv.appointment?.title ?? t("noAppointment"),
      t(statusConfig[inv.status].label),
      inv.paymentMethod ? methodLabel[inv.paymentMethod] : "",
      inv.totalAmount.toFixed(2),
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("csvFile")}_${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface InvoicesTableProps {
  initialInvoices: InvoiceFull[];
  services: ServiceFlat[];
}

export function InvoicesTable({ initialInvoices, services }: InvoicesTableProps) {
  const dateLocale = useDateLocale();
  const t = useTranslations("finances");
  const canWrite = useCan("invoice.write");
  const [invoices, setInvoices] = useState<InvoiceFull[]>(initialInvoices);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "ALL">("ALL");
  const [isLoading, startLoad] = useTransition();

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceFull | null>(null);

  function applyFilters(s: string, status: InvoiceStatus | "ALL") {
    startLoad(async () => {
      const results = await getInvoices({ search: s || undefined, status });
      setInvoices(results);
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    applyFilters(value, statusFilter);
  }

  function handleStatusChange(status: InvoiceStatus | "ALL") {
    setStatusFilter(status);
    applyFilters(search, status);
  }

  function handleSaved(invoice: InvoiceFull) {
    setInvoices((prev) => {
      const exists = prev.find((i) => i.id === invoice.id);
      return exists ? prev.map((i) => (i.id === invoice.id ? invoice : i)) : [invoice, ...prev];
    });
    setSelectedInvoice(invoice);
  }

  function handleUpdated(invoice: InvoiceFull) {
    setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? invoice : i)));
    setSelectedInvoice(invoice);
  }

  function handleDeleted(id: string) {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    setDetailOpen(false);
    setSelectedInvoice(null);
  }

  function openDetail(invoice: InvoiceFull) {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }

  function openEdit() {
    if (!selectedInvoice) return;
    setEditingInvoice(selectedInvoice);
    setDetailOpen(false);
    setEditOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={() => exportCSV(invoices, t as FinanceT)}
          >
            <Download className="w-4 h-4 mr-1.5" />
            CSV
          </Button>
          {canWrite && (
          <Button className="bg-primary text-primary-foreground" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("newInvoice")}
          </Button>
          )}
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleStatusChange(tab.value)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              statusFilter === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("patient")}</TableHead>
              <TableHead>{t("owner")}</TableHead>
              <TableHead>{t("appointment")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("method")}</TableHead>
              <TableHead className="text-right">{t("total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("noInvoices")}</p>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => {
                const stCfg = statusConfig[inv.status];
                return (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openDetail(inv)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      <span className="font-mono text-xs mr-1.5 text-muted-foreground">{formatInvoiceId(inv.number, inv.createdAt)}</span>
                      {format(new Date(inv.createdAt), "d MMM yyyy", { locale: dateLocale })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SpeciesBadge species={inv.pet.species} size="sm" />
                        <span className="font-medium text-sm">{inv.pet.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.pet.owner.firstName} {inv.pet.owner.lastName}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px]">
                      <p className="truncate">{inv.appointment?.title ?? t("noAppointment")}</p>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", stCfg.className)}>
                        {t(stCfg.label)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.paymentMethod === "CASH" && t("cash")}
                      {inv.paymentMethod === "CARD" && t("card")}
                      {inv.paymentMethod === "TRANSFER" && t("transfer")}
                      {!inv.paymentMethod && "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {fmt(inv.totalAmount)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {invoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t("noInvoices")}</p>
          </div>
        ) : (
          invoices.map((inv) => {
            const stCfg = statusConfig[inv.status];
            return (
              <button
                key={inv.id}
                className="w-full flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
                onClick={() => openDetail(inv)}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{inv.pet.name}</span>
                    <SpeciesBadge species={inv.pet.species} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.appointment?.title ?? t("noAppointment")}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stCfg.className)}>
                      {t(stCfg.label)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono mr-1">{formatInvoiceId(inv.number, inv.createdAt)}</span>
                      {format(new Date(inv.createdAt), "d MMM yyyy", { locale: dateLocale })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold">{fmt(inv.totalAmount)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {invoices.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {t("invoicesCount", { count: invoices.length })}
          {" · "}{t("totalIs", { amount: fmt(invoices.reduce((s, i) => s + i.totalAmount, 0)) })}
        </p>
      )}

      {/* Create dialog */}
      <InvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        services={services}
        onSaved={(inv) => { handleSaved(inv); setDetailOpen(true); }}
      />

      {/* Edit dialog */}
      {editingInvoice && (
        <InvoiceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          invoice={editingInvoice}
          services={services}
          onSaved={handleSaved}
        />
      )}

      {/* Detail sheet */}
      {selectedInvoice && (
        <InvoiceDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          invoice={selectedInvoice}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}
