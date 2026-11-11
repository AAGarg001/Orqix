import { useEffect, useRef, useState } from "react";
import { Copy, Terminal, Activity } from "lucide-react";
import { toast } from "sonner";
import type { Job } from "../types";
import { Button, StatusBadge } from "./ui";

export function BotLogPanel({job}:{job?:Job}) {
  const [follow,setFollow]=useState(true), panel=useRef<HTMLDivElement>(null);
  const last=job?.events?.at(-1)?.sequence;
  useEffect(()=>{if(follow&&panel.current)panel.current.scrollTop=panel.current.scrollHeight;},[last,follow]);
  async function copy(){try{await navigator.clipboard.writeText((job?.events??[]).map(e=>`${new Date(e.time).toLocaleString('en-IN')} ${e.message}`).join('\n'));toast.success('Sanitized logs copied');}catch{toast.error('Clipboard unavailable. Select and copy the visible logs.');}}
  return <section className="oq-card oq-log-panel">
    <div className="oq-card-heading"><h2><Terminal size={19}/>Live BOT Logs</h2><StatusBadge value={job?.status??'Disconnected'}/></div>
    <div className="oq-log-toolbar"><label className="oq-check-label"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>Auto-scroll</label><Button variant="ghost" disabled={!job?.events?.length} onClick={copy}><Copy size={14}/>Copy logs</Button></div>
    {job?.status==='running'?<div className="oq-execution-banner"><Activity size={17}/><span>{job.stage}</span><strong>{job.records.toLocaleString('en-IN')} records</strong></div>:null}
    <div className="oq-live-logs" ref={panel} role="log" aria-label="Sanitized BOT events" aria-live="polite" tabIndex={0}>
      {job?.events?.length?job.events.map(e=><div key={e.sequence}><time dateTime={e.time}>{new Date(e.time).toLocaleTimeString('en-IN')}</time><p>{e.message}</p></div>):<div className="oq-log-empty"><Terminal size={24}/><strong>No events yet</strong><p>Events appear when the real browser session starts.</p></div>}
    </div>
  </section>;
}
