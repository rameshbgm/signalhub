"use client";

import { useEffect, useRef } from "react";

type Handlers = {
  /** Ids of the rows on screen, top to bottom. */
  ids: string[];
  focusId: string | null;
  expanded: ReadonlySet<string>;
  setFocusId: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCollapseAll: () => void;
};

const TYPING = 'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="listbox"]';

/** j and k move the focused row, x selects it, Enter expands it, Escape collapses everything. Silent while typing or when a dialog is open. */
export function useListKeys(handlers: Handlers) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TYPING) || document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const { ids, focusId, expanded, setFocusId, onToggleSelect, onToggleExpand, onCollapseAll } = ref.current;
      const index = focusId ? ids.indexOf(focusId) : -1;
      if (event.key === "j" || event.key === "k") {
        const next = ids[Math.max(0, Math.min(ids.length - 1, index + (event.key === "j" ? 1 : -1)))];
        if (!next) return;
        event.preventDefault();
        // A button left focused by an earlier click would otherwise swallow the Enter that should open the row.
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
        setFocusId(next);
        requestAnimationFrame(() => document.querySelector(`[data-row-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
      } else if (event.key === "x" && focusId && index >= 0) {
        event.preventDefault();
        onToggleSelect(focusId);
      } else if (event.key === "Enter" && focusId && index >= 0 && !target?.closest("a, button")) {
        event.preventDefault();
        onToggleExpand(focusId);
      } else if (event.key === "Escape" && expanded.size > 0) {
        onCollapseAll();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
