import { useEffect, useRef, useState } from "react";
// @ts-expect-error noVNC does not publish TypeScript declarations
import RFB from "@novnc/novnc";
import { post } from "./api";
export default function BrowserView({ id, running }: { id: string; running: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("Connecting to your isolated browser…");
  useEffect(() => {
    if (!host.current) return;
    if (running) {
      setState("Automation running. Browser controls are locked until it finishes.");
      return;
    }
    let cancelled = false;
    let connection: { disconnect(): void } | undefined;
    setState("Connecting to your isolated browser…");
    void post<{ websocketUrl: string }>(`/jobs/${id}/browser-ticket`).then(({ websocketUrl }) => {
      if (cancelled || !host.current) return;
      const rfb = new RFB(host.current, websocketUrl);
      connection = rfb;
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.addEventListener("connect", () => { if (!cancelled) setState("Connected · enter the OTP in the portal browser below"); });
      rfb.addEventListener("disconnect", () => { if (!cancelled) setState("Browser disconnected. Reopen the live view to reconnect."); });
    }).catch(() => { if (!cancelled) setState("Browser connection failed. Reopen the live view or check job status."); });
    return () => { cancelled = true; connection?.disconnect(); };
  }, [id, running]);
  return <div><p className="browser-caption" role="status">{state}</p><div className="vnc-screen" ref={host} /></div>;
}
