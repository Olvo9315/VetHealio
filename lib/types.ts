import type { Pet, Owner, Species, AppointmentStatus, AppointmentType } from "@prisma/client";

// Full pet with owner (list view)
export type PetWithOwner = Pet & { owner: Owner };

// Full pet with all relations (detail view)
export type PetFull = Pet & {
  owner: Owner;
  medicalRecords: Array<{
    id: string;
    date: Date;
    chiefComplaint: string;
    diagnosis: string | null;
    treatment: string | null;
    weight: number | null;
    temperature: number | null;
    heartRate: number | null;
    notes: string | null;
    createdAt: Date;
    veterinarian: { name: string };
    prescriptions: Array<{
      id: string;
      medicationName: string;
      dosage: string;
      frequency: string;
      duration: string;
    }>;
  }>;
  vaccinations: Array<{
    id: string;
    vaccineName: string;
    dateAdministered: Date;
    nextDueDate: Date | null;
    batchNumber: string | null;
    veterinarian: { name: string };
  }>;
  appointments: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    status: AppointmentStatus;
    type: AppointmentType;
    veterinarian: { name: string };
    invoice: { totalAmount: number; status: string } | null;
  }>;
};

export type PetFilters = {
  search?: string;
  species?: Species | "ALL";
  isActive?: boolean | "ALL";
};
