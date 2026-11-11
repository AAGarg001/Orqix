import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useLocation, useNavigationType } from "react-router-dom";

export const motionTiming = { feedback: .14, hover: .18, dialog: .26, page: .28, sidebar: .3 };
export function RouteSurface({children}:{children:ReactNode}) {
  const {pathname}=useLocation(), navigation=useNavigationType(), reduce=useReducedMotion();
  useEffect(()=>{if(navigation!=="POP") window.scrollTo({top:0,behavior:"instant"});},[pathname,navigation]);
  return <motion.div key={pathname} className="oq-route-surface" initial={reduce?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:motionTiming.page,ease:[.22,.8,.25,1]}}>{children}</motion.div>;
}

export function useDismissableLayer(open:boolean,onClose:()=>void) {
  const ref=useRef<HTMLDivElement>(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const trigger=ref.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]');
    function pointer(e:PointerEvent){if(!ref.current?.contains(e.target as Node))closeRef.current();}
    function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();closeRef.current();trigger?.focus();}}
    function focus(e:FocusEvent){if(!ref.current?.contains(e.target as Node))closeRef.current();}
    document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
    return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);};
  },[open]);
  return ref;
}

export function useDrawerFocus(open:boolean,onClose:()=>void) {
  const sidebar=useRef<HTMLElement>(null), content=useRef<HTMLDivElement>(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const returnTo=document.activeElement as HTMLElement, previousOverflow=document.body.style.overflow;
    const main=content.current; if(main)main.inert=true;
    document.body.style.overflow='hidden';
    const controls=()=>Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
    controls()[0]?.focus();
    function key(e:KeyboardEvent){
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab'){const list=controls(),first=list[0],last=list.at(-1);if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    }
    const screen=window.matchMedia('(min-width: 801px)');
    function resize(){if(screen.matches)closeRef.current();}
    screen.addEventListener('change',resize);document.addEventListener('keydown',key);
    return()=>{if(main)main.inert=false;document.body.style.overflow=previousOverflow;screen.removeEventListener('change',resize);document.removeEventListener('keydown',key);returnTo?.focus();};
  },[open]);
  return {sidebar,content};
}
