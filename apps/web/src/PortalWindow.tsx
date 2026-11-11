import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "./api";
import type { Job } from "./types";
import BrowserView from "./BrowserView";

export default function PortalWindow() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["portal-window", id], queryFn: () => api<{ job: Job }>(`/jobs/${id}`), enabled: !!id, refetchInterval: 3000 });
  const job = query.data?.job;
  return <main style={{ padding: 20, maxWidth: 1500, margin: "auto" }}>
    <h1>CPCB portal browser</h1>
    <p>This window controls your private cloud Chrome session. Complete OTP here, then return to ORQIX to verify login and start extraction.</p>
    {query.error ? <p role="alert">{query.error.message}</p> : !id || !job || job.status === "starting" ? <p role="status">Preparing your portal session…</p>
      : ["cancelled", "failed", "completed", "partial"].includes(job.status) ? <p role="status">{job.stage}. Return to ORQIX for the next action.</p>
      : <BrowserView id={job.id} running={job.status === "running"} />}
  </main>;
}
