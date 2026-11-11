import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui";
export function CopyAction({text,label="Copy response"}:{text:string;label?:string}) {
  return <Button type="button" variant="ghost" aria-label={label} onClick={async()=>{try{await navigator.clipboard.writeText(text);toast.success('Copied to clipboard');}catch{toast.error('Clipboard unavailable. Select and copy the text.');}}}><Copy size={14}/>{label}</Button>;
}
