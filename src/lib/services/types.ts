export type ServiceInput = Record<string, string | number>;

export type ServiceStatus = "pending" | "processing" | "completed" | "failed";

export type ServiceField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
  // How the field is rendered. text (default), number, textarea or select.
  control?: "text" | "number" | "textarea" | "select";
  min?: number;
  max?: number;
  defaultValue?: string | number;
  // For select controls: the choices shown. Also used by the client to seed
  // the initial value (defaultValue preferred, else the first option).
  options?: { value: string; label: string }[];
};

export type ServiceColumn = {
  key: string;
  label: string;
  // "link" renders the value as a clickable external link.
  type?: "text" | "link";
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