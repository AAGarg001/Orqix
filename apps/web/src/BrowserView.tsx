import { useEffect, useRef, useState } from "react";
// noVNC ships JavaScript ESM without bundled TypeScript declarations.
// @ts-expect-error noVNC declaration is not published
import RFB from "@novnc/novnc";
export default function BrowserView({
  id,
  running,
}: {
  id: string;
  running: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("Connecting to your isolated browser…");
  useEffect(() => {
    if (!host.current) return;
    const rfb = new RFB(
      host.current,
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/jobs/${id}/browser`,
    );
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.viewOnly = running;
    rfb.addEventListener("connect", () =>
      setState(
        running
          ? "Connected · view only during extraction"
          : "Connected · you can enter the OTP directly below",
      ),
    );
    rfb.addEventListener("disconnect", () =>
      setState(
        "Browser disconnected. Reopen the live view or check job status.",
      ),
    );
    return () => rfb.disconnect();
  }, [id, running]);
  return (
    <div>
      <p className="browser-caption" role="status">
        {state}
      </p>
      <div className="vnc-screen" ref={host} />
    </div>
  );
}
