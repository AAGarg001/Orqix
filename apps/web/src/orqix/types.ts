export type User = {
  accountKind?: "staff" | "client";
  emailVerified?: boolean;
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  permissions: string[];
  teamId: string;
  department: string;
  reportingManagerId: string;
  username: string;
  mobile: string;
  designation: string;
};
export type Session = {
  user: User | null;
  workerRuntime: "local" | "hosted";
  metadataStore: string;
  retentionMinutes: number;
};
export type Doc = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
};
export type AssignmentView = Doc & {
  client?: Doc;
  account?: Doc;
  employee?: string;
  workflow?: Doc;
  progress: number;
};
export type Dashboard = {
  rows: AssignmentView[];
  metrics: {
    clients: number;
    cpcbIds: number;
    total: number;
    completed: number;
    pending: number;
    notStarted: number;
    failedJobs: number;
    awaitingApproval: number;
  };
  jobs: Doc[];
};
