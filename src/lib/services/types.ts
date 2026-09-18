export type ServiceInput = Record<string, string>;

export type ServiceStatus = "pending" | "processing" | "completed" | "failed";

export type ServiceField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type ServiceColumn = {
  key: string;
  label: string;
};

export type ServiceResultRow = Record<string, unknown>;

export type ServiceRequestRow = {
  id: string;
  uuid: string;
  service_name: string | null;
  service_key: string | null;
  status: ServiceStatus;
  input: ServiceInput | null;
  output: unknown;
  created_at: string;
};