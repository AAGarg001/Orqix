import { useEffect, useRef, useState } from "react";
import { post } from "./api";
const keys = ["Tab", "Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "SelectAll"] as const;
export default function BrowserView({ id, running }: { id: string; running: boolean }) {
  const [frame, setFrame] = useState("");
  const [message, setMessage] = useState("Loading private portal browser…");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const currentUrl = useRef("");
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setFrame("");
    if (running) { setMessage("Automation running. Browser controls are locked."); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/jobs/${id}/browser/frame`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Browser unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob), previous = currentUrl.current;
        currentUrl.current = url; setFrame(url);
        if (previous) URL.revokeObjectURL(previous);
        setMessage("Click a portal field, then type below or use your keyboard. Complete OTP manually.");
      } catch { if (!controller.signal.aborted) setMessage("Waiting for the portal browser. Reopen login if the session has ended."); }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => { generation.current++; controller.abort(); clearTimeout(timer); if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); currentUrl.current = ""; };
  }, [id, running]);
  async function input(body: Record<string, unknown>) {
    if (running) return;
    const version = generation.current;
    queue.current = queue.current.then(async () => {
      if (version !== generation.current) return;
      setBusy(true);
      try { await post(`/jobs/${id}/browser/input`, body); }
      catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : "Browser input failed."); }
      finally { if (version === generation.current) setBusy(false); }
    });
    await queue.current;
  }
  return <section aria-label="Private portal browser">
    <p role="status">{message}</p>
    {!running && <>
      <form onSubmit={event => { event.preventDefault(); void input({ action: "text", text }); setText(""); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <label>Text or OTP for selected portal field <input aria-label="Text or OTP for selected portal field" type="password" autoComplete="off" maxLength={256} value={text} onChange={event => setText(event.target.value)} /></label>
        <button type="submit" disabled={busy || !text}>Type into portal</button>
        {(["Tab", "Enter", "Backspace", "SelectAll"] as const).map(key => <button type="button" disabled={busy} key={key} onClick={() => void input({ action: "key", key })}>{key === "SelectAll" ? "Select all" : key}</button>)}
        <button type="button" disabled={busy} onClick={() => void input({ action: "scroll", delta: -500 })}>Scroll up</button>
        <button type="button" disabled={busy} onClick={() => void input({ action: "scroll", delta: 500 })}>Scroll down</button>
      </form>
      {frame && <img src={frame} alt="Live private portal browser" role="button" tabIndex={0} aria-label="Portal browser. Click a field and type, or use the controls above." style={{ width: "100%", display: "block", border: "1px solid #cbd5e1" }}
        onClick={event => { const image = event.currentTarget, bounds = image.getBoundingClientRect(); image.focus(); void input({ action: "click", x: Math.round((event.clientX - bounds.left) * image.naturalWidth / bounds.width), y: Math.round((event.clientY - bounds.top) * image.naturalHeight / bounds.height) }); }}
        onKeyDown={event => { let key = event.key; if (event.ctrlKey && key.toLowerCase() === "a") key = "SelectAll"; if (keys.includes(key as typeof keys[number])) { event.preventDefault(); void input({ action: "key", key }); } else if (key.length === 1 && !event.ctrlKey && !event.metaKey) { event.preventDefault(); void input({ action: "text", text: key }); } }} />}
    </>}
  </section>;
}
