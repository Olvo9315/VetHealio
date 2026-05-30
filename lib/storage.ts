import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "staff-documents";

export async function uploadStaffDocument(
  file: Buffer,
  fileName: string,
  staffId: string,
  folder: "diploma" | "contract" | "certification" = "diploma"
): Promise<string> {
  const path = `staff/${staffId}/${folder}/${fileName}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: guessContentType(fileName),
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw new Error(error?.message ?? "Failed to create signed URL");
  return data.signedUrl;
}

export async function deleteStaffDocument(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
