import type { Pet, Owner, Species, AppointmentStatus, AppointmentType, Gender } from "@prisma/client";

export type { Gender };

// Full pet with owner (list view)
export type PetWithOwner = Pet & {
  owner: Owner;
  appointments: Array<{ startTime: Date }>;
};

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
    number: number;
    title: string;
    startTime: Date;
    endTime: Date;
    status: AppointmentStatus;
    type: AppointmentType;
    veterinarian: { name: string };
    invoice: { totalAmount: number; status: string } | null;
  }>;
  invoices: Array<{
    id: string;
    number: number;
    status: string;
    totalAmount: number;
    createdAt: Date;
    appointmentId: string | null;
    appointment: { title: string; startTime: Date } | null;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  }>;
  prescriptions: Array<{
    id: string;
    number: number;
    notes: string | null;
    createdAt: Date;
    veterinarianId: string | null;
    appointmentId: string | null;
    veterinarian: { name: string } | null;
    appointment: { id: string; title: string; startTime: Date; number: number } | null;
    items: Array<{
      id: string;
      medicationName: string;
      units: string | null;
      activeIngredient: string | null;
      posology: string;
      indications: string | null;
      warnings: string | null;
    }>;
  }>;
};

export type PetFilters = {
  search?: string;
  species?: Species | "ALL";
  isActive?: boolean | "ALL";
};
