"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComboInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "list" | "value" | "defaultValue" | "onChange"> & {
  options: string[];
  defaultValue?: string;
};

/** Free-text input with a full-width, styled suggestion list (replaces the browser's native datalist popup). */
export function ComboInput({ options, defaultValue = "", className, onFocus, onKeyDown, ...props }: ComboInputProps) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLowerCase();
  const shown = options.filter((option) => !query || option.toLowerCase().includes(query));
  const visible = open && shown.length > 0 && !(shown.length === 1 && shown[0] === value);

  const choose = (option: string) => {
    setValue(option);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Input
        {...props}
        value={value}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        className={cn("pr-9", className)}
        onChange={(event) => { setValue(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={(event) => { setOpen(true); onFocus?.(event); }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
          } else if (event.key === "Enter" && visible && active >= 0) { event.preventDefault(); choose(shown[active]); }
        }}
      />
      <ChevronDown aria-hidden size={16} className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim transition-transform", visible && "rotate-180")} />
      {visible && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 animate-drop overflow-auto rounded-control border border-line bg-surface p-1 shadow-float">
          {shown.map((option, index) => (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => { event.preventDefault(); choose(option); }}
              onMouseEnter={() => setActive(index)}
              className={cn("cursor-pointer truncate rounded-chip px-2.5 py-2 text-sm text-ink", index === active && "bg-primary/10")}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
