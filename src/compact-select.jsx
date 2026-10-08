import { useEffect, useId, useRef, useState } from "react";
import "./compact-select.css";
// A compact custom select for internal forms, sharing the site's field styling.
export function CompactSelect({ label, value, options, onChange, formatOption = (item) => item, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [scroll, setScroll] = useState({height:100,top:0});
  const optionsRef = useRef(null);
  const root = useRef(null); const trigger = useRef(null); const listId = useId(); const labelId = useId();
  const selected = options.includes(value) ? value : options[0];
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown",outside);
    root.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener("pointerdown",outside);
  },[open]);
  useEffect(() => { if (disabled) setOpen(false); },[disabled]);
  const updateScroll = () => {
    const list = optionsRef.current; if (!list) return;
    const height = Math.min(100, Math.max(100 * 18 / list.clientHeight, 100 * list.clientHeight / list.scrollHeight));
    const top = list.scrollHeight > list.clientHeight ? list.scrollTop / (list.scrollHeight - list.clientHeight) * (100 - height) : 0;
    setScroll({height,top});
  };
  useEffect(() => {
    if (!open) return;
    updateScroll();
    const observer = new ResizeObserver(updateScroll); observer.observe(optionsRef.current);
    window.addEventListener("resize",updateScroll);
    return () => { observer.disconnect(); window.removeEventListener("resize",updateScroll); };
  },[open,options.length]);
  const keyboard = (event) => {
    if (disabled) return;
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab" && open) { close(true); return; }
    if (!["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const items = [...root.current.querySelectorAll('[role="option"]')]; if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length-1 : (index+(event.key === "ArrowDown" ? 1 : -1)+items.length)%items.length;
    items[next]?.focus();
  };
  return <div ref={root} className={`select-field compact-select${open ? " open" : ""}`} onKeyDown={keyboard}><span id={labelId}>{label}</span><button ref={trigger} type="button" className="select-trigger" disabled={disabled} aria-label={`${label}: ${formatOption(selected)}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((state) => !state)}><span>{formatOption(selected)}</span><b aria-hidden="true">⌄</b></button>{open && <div className="compact-select-menu"><div ref={optionsRef} onScroll={updateScroll} id={listId} role="listbox" aria-labelledby={labelId} className="compact-select-options">{options.map((item) => <button key={item} type="button" tabIndex={-1} role="option" aria-selected={item === selected} onClick={() => { onChange(item); close(true); }}>{formatOption(item)}</button>)}</div>{scroll.height < 100 && <div className="compact-select-scroll" aria-hidden="true"><i style={{height:`${scroll.height}%`,top:`${scroll.top}%`}} /></div>}</div>}</div>;
}
