export type Job = {
  assignmentId?: string;
  kind?: "extract" | "upload" | "delete";
  id: string;
  name: string;
  mode: "all" | "available" | "combined";
  status: string;
  stage: string;
  records: number;
  sections: { name: string; status: string; records?: number }[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  artifact: boolean;
  error?: string;
  events?: { sequence: number; time: string; message: string; kind?: string }[];
};
export type Me = {
  user: { id: string; name: string; email: string };
  workerRuntime: "local" | "docker";
  metadataStore: "memory" | "mongodb";
  retentionMinutes: number;
  maxJobsPerUser: number;
};
export const isActive = (status: string) =>
  ["starting", "awaiting_otp", "ready", "running"].includes(status);
