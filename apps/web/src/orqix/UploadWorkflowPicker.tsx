import { useState } from "react";
import { Button, ConfirmationDialog } from "./ui";

export type UploadMode = "pwp" | "pibo" | "sales" | "sales_export";
export const uploadModeLabels: Record<UploadMode, string> = {
  pwp: "PWP Upload", pibo: "PIBO Purchase / Procurement",
  sales: "PIBO Sales — Domestic", sales_export: "PIBO Sales — Export",
};
export function UploadWorkflowPicker({value,onChange,disabled}: {
  value: UploadMode | null; onChange: (mode:UploadMode|null)=>void; disabled:boolean;
}) {
  const [step,setStep]=useState<"operation"|"sales">("operation");
  const [open,setOpen]=useState(false);
  const choose = (mode:UploadMode) => { onChange(mode); setOpen(false); };
  return <section className="oq-card oq-upload-picker">
    <h2>Choose operation</h2>
    <p>Select PWP or PIBO. For PIBO choose Sales or Purchase, then the sales destination.</p>
    <div className="oq-actions">
      <Button variant={value==='pwp'?'primary':'secondary'} aria-pressed={value==='pwp'} disabled={disabled} onClick={()=>choose('pwp')}>PWP Upload</Button>
      <Button variant={value&&value!=='pwp'?'primary':'secondary'} aria-pressed={!!value&&value!=='pwp'} disabled={disabled} onClick={()=>{setStep('operation');setOpen(true);}}>PIBO Upload</Button>
    </div>
    <ConfirmationDialog open={open} onClose={()=>setOpen(false)} title={step==='sales'?'Where are these sales made?':'What would you like to upload?'} description={step==='sales'?'Select Domestic or Export for the correct sales form and template.':'Select Sales or Purchase / Procurement for PIBO.'}>
      <div className="oq-picker-step" key={step}>
        <div className="oq-choice-grid">
          {step==='operation' ? <>
            <Button disabled={disabled} variant="secondary" onClick={()=>setStep('sales')}>Sales</Button>
            <Button disabled={disabled} variant="secondary" onClick={()=>choose('pibo')}>Purchase / Procurement</Button>
          </> : <>
            <Button disabled={disabled} variant="secondary" onClick={()=>choose('sales')}>Domestic</Button>
            <Button disabled={disabled} variant="secondary" onClick={()=>choose('sales_export')}>Export</Button>
          </>}
        </div>
        {step==='sales' ? <Button variant="ghost" onClick={()=>setStep('operation')}>Back to Sales / Purchase</Button> : null}
      </div>
    </ConfirmationDialog>
    <p role="status">{value ? `Selected: ${uploadModeLabels[value]}` : 'Choose a complete upload workflow to enable its files and template.'}</p>
    {value?.startsWith('sales') ? <div className="oq-info amber">Original BOT generates the EPR Invoice Number; final Submit is disabled in the supplied source.</div> : null}
  </section>;
}
