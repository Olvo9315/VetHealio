"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { MedicalRecordFull } from "@/lib/actions/medicalRecords";
import { getMedicalRecords } from "@/lib/actions/medicalRecords";
import { MedicalRecordDialog } from "./MedicalRecordDialog";
import { MedicalRecordDetailSheet } from "./MedicalRecordDetailSheet";
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
import { Search, Plus, Stethoscope, Loader2, Pill, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicalRecordsTableProps {
  initialRecords: MedicalRecordFull[];
}

export function MedicalRecordsTable({ initialRecords }: MedicalRecordsTableProps) {
  const [records, setRecords] = useState<MedicalRecordFull[]>(initialRecords);
  const [search, setSearch] = useState("");
  const [isSearching, startSearch] = useTransition();

  const [selectedRecord, setSelectedRecord] = useState<MedicalRecordFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecordFull | null>(null);

  function handleSearchChange(value: string) {
    setSearch(value);
    startSearch(async () => {
      const results = await getMedicalRecords(value || undefined);
      setRecords(results);
    });
  }

  function handleSaved(record: MedicalRecordFull) {
    setRecords((prev) => {
      const exists = prev.find((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [record, ...prev];
    });
    setSelectedRecord(record);
  }

  function handleDeleted(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDetailOpen(false);
    setSelectedRecord(null);
  }

  function openDetail(record: MedicalRecordFull) {
    setSelectedRecord(record);
    setDetailOpen(true);
  }

  function openEdit() {
    if (!selectedRecord) return;
    setEditingRecord(selectedRecord);
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
            placeholder="Buscar por paciente, diagnóstico..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          className="bg-primary text-primary-foreground shrink-0"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo registro
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Diagnóstico</TableHead>
              <TableHead>Veterinario</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No se encontraron registros</p>
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow
                  key={record.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openDetail(record)}
                >
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(record.date), "d MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <SpeciesBadge species={record.pet.species} size="sm" />
                      <span className="font-medium text-sm">{record.pet.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {record.pet.owner.firstName} {record.pet.owner.lastName}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px]">
                    <p className="truncate">{record.chiefComplaint}</p>
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px]">
                    {record.diagnosis ? (
                      <p className="truncate">{record.diagnosis}</p>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{record.veterinarian.name}</TableCell>
                  <TableCell>
                    {record.prescriptions.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Pill className="w-3.5 h-3.5" />
                        {record.prescriptions.length}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {records.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No se encontraron registros</p>
          </div>
        ) : (
          records.map((record) => (
            <button
              key={record.id}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
              onClick={() => openDetail(record)}
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Stethoscope className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{record.pet.name}</span>
                  <SpeciesBadge species={record.pet.species} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{record.chiefComplaint}</p>
                {record.diagnosis && (
                  <p className="text-xs text-foreground/70 truncate">{record.diagnosis}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(record.date), "d MMM yyyy", { locale: es })}
                  </span>
                  {record.prescriptions.length > 0 && (
                    <span className={cn("flex items-center gap-0.5 text-xs text-muted-foreground")}>
                      <Pill className="w-3 h-3" />
                      {record.prescriptions.length} receta{record.prescriptions.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2" />
            </button>
          ))
        )}
      </div>

      {/* Record count */}
      {records.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {records.length} registro{records.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Create dialog */}
      <MedicalRecordDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(r) => { handleSaved(r); setDetailOpen(true); setSelectedRecord(r); }}
      />

      {/* Edit dialog */}
      {editingRecord && (
        <MedicalRecordDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          record={editingRecord}
          onSaved={handleSaved}
        />
      )}

      {/* Detail sheet */}
      {selectedRecord && (
        <MedicalRecordDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          record={selectedRecord}
          onDeleted={handleDeleted}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}
