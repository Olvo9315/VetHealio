"use client";

import { useState, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateStaffProfile, getSignedDocumentUrl } from "@/lib/actions/staff";
import { Button } from "@/components/ui/button";
import { FileText, Upload, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface StaffDocumentsProps {
  staffProfileId: string;
  diplomaPath: string | null;
  contractPath: string | null;
}

type DocType = "diploma" | "contract";

export function StaffDocuments({ staffProfileId, diplomaPath, contractPath }: StaffDocumentsProps) {
  const t = useTranslations("staff");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<DocType | null>(null);
  const diplomaRef = useRef<HTMLInputElement>(null);
  const contractRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File, docType: DocType) {
    setUploading(docType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("staffId", staffProfileId);
      formData.append("folder", docType);

      const res = await fetch("/api/staff/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { path } = await res.json();

      await updateStaffProfile(staffProfileId, {
        ...(docType === "diploma" ? { diplomaPath: path } : { contractPath: path }),
      });

      toast.success(t("saved"));
      router.refresh();
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setUploading(null);
    }
  }

  async function openDoc(path: string) {
    startTransition(async () => {
      try {
        const url = await getSignedDocumentUrl(path);
        window.open(url, "_blank");
      } catch {
        toast.error(t("errorSave"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <DocRow
        label={t("diploma")}
        path={diplomaPath}
        isUploading={uploading === "diploma"}
        isPendingView={isPending}
        inputRef={diplomaRef}
        uploadLabel={t("uploadDiploma")}
        viewLabel={t("viewDocument")}
        onChoose={() => diplomaRef.current?.click()}
        onFileSelect={(f) => handleUpload(f, "diploma")}
        onView={() => diplomaPath && openDoc(diplomaPath)}
      />
      <DocRow
        label={t("contract")}
        path={contractPath}
        isUploading={uploading === "contract"}
        isPendingView={isPending}
        inputRef={contractRef}
        uploadLabel={t("uploadContract")}
        viewLabel={t("viewDocument")}
        onChoose={() => contractRef.current?.click()}
        onFileSelect={(f) => handleUpload(f, "contract")}
        onView={() => contractPath && openDoc(contractPath)}
      />
    </div>
  );
}

function DocRow({
  label, path, isUploading, isPendingView, inputRef, uploadLabel, viewLabel,
  onChoose, onFileSelect, onView,
}: {
  label: string;
  path: string | null;
  isUploading: boolean;
  isPendingView: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  uploadLabel: string;
  viewLabel: string;
  onChoose: () => void;
  onFileSelect: (f: File) => void;
  onView: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {path ? path.split("/").pop() : "—"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {path && (
          <Button variant="outline" size="sm" disabled={isPendingView} onClick={onView}>
            {isPendingView ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            {viewLabel}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={isUploading} onClick={onChoose}>
          {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
          {uploadLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onFileSelect(f); e.target.value = ""; }
          }}
        />
      </div>
    </div>
  );
}
