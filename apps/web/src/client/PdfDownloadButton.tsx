import { useEffect, useState } from "react";
import {
  Download,
  Upload,
  ImagePlus,
  ShieldCheck,
  X,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog, ErrorAlert } from "../orqix/ui";
import "./pdf-download.css";
export function PdfDownloadButton({
  href,
  title,
  company,
  disabled = false,
  className = "ab-button secondary",
  label = "Download PDF",
}: {
  href: string;
  title: string;
  company?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [logo, setLogo] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!logo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);
  const choose = (file?: File) => {
    setError(null);
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError(new Error("Choose a PNG or JPG company logo, maximum 2 MB."));
      return;
    }
    setLogo(file);
  };
  const download = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (logo && !skip) form.append("logo", logo);
      const response = await fetch(href, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({
          error: "PDF could not be generated. Please retry.",
        }));
        throw new Error(result.error ?? "PDF download failed.");
      }
      if (!response.headers.get("content-type")?.includes("application/pdf"))
        throw new Error(
          "The server did not return a PDF. Please sign in again.",
        );
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      const name = response.headers
        .get("content-disposition")
        ?.match(/filename="?([^";]+)"?/i)?.[1];
      a.download =
        name?.replace(/[\\/]/g, "_") ?? "A-A-Garg-Business-Report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setOpen(false);
      setLogo(null);
      toast.success("Your branded PDF report is ready.");
    } catch (e) {
      setError(e instanceof Error ? e : new Error("PDF download failed."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className={className}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Download size={16} />
        {label}
      </button>
      <ConfirmationDialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Make this report yours"
        description="Add your company logo before downloading. This step is optional."
        wide
      >
        <div className="pdf-customize">
          <div>
            <span className="pdf-step">REPORT BRANDING</span>
            <h3>Your company. Your report.</h3>
            <p>
              Add a PNG or JPG logo to display alongside A A GARG & CO on every
              page.
            </p>
            <label
              className="pdf-upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                choose(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Upload your company logo (optional)"
                disabled={busy}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {preview ? (
                <img src={preview} alt="Your company logo preview" />
              ) : (
                <ImagePlus size={32} />
              )}
              <strong>{logo?.name ?? "Upload your company logo"}</strong>
              <span>Optional · PNG / JPG · up to 2 MB · max 4096px</span>
              <span className="pdf-upload-link">
                <Upload size={14} />
                {logo ? "Choose a different logo" : "Browse or drop a file"}
              </span>
            </label>
            {logo ? (
              <button
                className="ab-text-button"
                disabled={busy}
                onClick={() => setLogo(null)}
              >
                <X size={14} />
                Remove logo
              </button>
            ) : null}
            <div className="pdf-private">
              <ShieldCheck size={18} />
              <span>
                Your logo is used only for this download. It is not saved to
                your account.
              </span>
            </div>
          </div>
          <div className="pdf-paper">
            <div className="pdf-paper-top">
              <img src="/aa-garg-logo.svg" alt="A A Garg & Co" />
              {preview ? (
                <img src={preview} alt="Optional company branding" />
              ) : (
                <span>
                  COMPANY LOGO
                  <br />
                  (optional)
                </span>
              )}
            </div>
            <div className="pdf-paper-rule" />
            <span className="pdf-step">{/receipt|invoice/i.test(title) ? 'BILLING DOCUMENT' : 'MANAGEMENT INSIGHTS'}</span>
            <h4>{title}</h4>
            <p>{company ?? "Your organization"}</p>
            <div className="pdf-preview-cards">
              <i />
              <i />
              <i />
            </div>
            <div className="pdf-preview-chart">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="pdf-preview-lines">
              <i />
              <i />
              <i />
            </div>
            <span className="pdf-paper-footer">
              Confidential business report · A A GARG & CO
            </span>
          </div>
        </div>
        <ErrorAlert error={error} />
        <div className="pdf-download-footer">
          <span>
            <FileText size={16} />
            Professionally formatted PDF
          </span>
          <div>
            {logo ? (
              <button
                className="ab-button secondary"
                disabled={busy}
                onClick={() => {
                  void download(true);
                }}
              >
                Download without company logo
              </button>
            ) : null}
            <button
              className="ab-button"
              disabled={busy}
              onClick={() => {
                void download();
              }}
            >
              {busy ? (
                <LoaderCircle className="tp-spin" size={17} />
              ) : (
                <Download size={17} />
              )}{" "}
              {busy ? "Preparing your report…" : "Download PDF"}
            </button>
          </div>
        </div>
      </ConfirmationDialog>
    </>
  );
}
