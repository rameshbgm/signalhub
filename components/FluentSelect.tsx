"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Button, Listbox, Option } from "@fluentui/react-components";

type FluentSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size"
> & {
  multiple?: never;
  size?: never;
};

type SelectOption = {
  disabled: boolean;
  label: string;
  value: string;
};

type MenuPlacement = "above" | "below";

type MenuPosition = CSSProperties & {
  maxHeight: number;
  width: number;
};

type SelectMenuLayoutInput = {
  contentWidth: number;
  optionCount: number;
  trigger: {
    bottom: number;
    left: number;
    right: number;
    top: number;
    width: number;
  };
  viewportHeight: number;
  viewportWidth: number;
};

const MENU_GAP = 6;
const VIEWPORT_INSET = 8;
const MAX_MENU_HEIGHT = 320;
const MIN_MENU_HEIGHT = 72;

export function calculateSelectMenuLayout({
  contentWidth,
  optionCount,
  trigger,
  viewportHeight,
  viewportWidth,
}: SelectMenuLayoutInput): {
  placement: MenuPlacement;
  position: MenuPosition;
} {
  const availableWidth = Math.max(0, viewportWidth - VIEWPORT_INSET * 2);
  const width = Math.min(
    availableWidth,
    Math.max(Math.ceil(trigger.width), contentWidth)
  );
  let left = Math.max(VIEWPORT_INSET, trigger.left);
  if (left + width > viewportWidth - VIEWPORT_INSET) {
    left = Math.max(VIEWPORT_INSET, trigger.right - width);
  }

  const estimatedHeight = Math.min(MAX_MENU_HEIGHT, optionCount * 38 + 8);
  const roomBelow = viewportHeight - trigger.bottom - MENU_GAP - VIEWPORT_INSET;
  const roomAbove = trigger.top - MENU_GAP - VIEWPORT_INSET;
  const placement: MenuPlacement =
    roomBelow >= Math.min(estimatedHeight, 180) || roomBelow >= roomAbove
      ? "below"
      : "above";
  const availableHeight = placement === "below" ? roomBelow : roomAbove;
  const maxHeight = Math.max(
    Math.min(MIN_MENU_HEIGHT, Math.max(0, availableHeight)),
    Math.min(MAX_MENU_HEIGHT, Math.max(0, availableHeight))
  );

  return {
    placement,
    position: {
      bottom:
        placement === "above"
          ? Math.max(VIEWPORT_INSET, viewportHeight - trigger.top + MENU_GAP)
          : undefined,
      left: Math.round(left),
      maxHeight: Math.round(maxHeight),
      top:
        placement === "below"
          ? Math.min(viewportHeight - VIEWPORT_INSET, trigger.bottom + MENU_GAP)
          : undefined,
      width: Math.round(width),
    },
  };
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  function visit(nodes: ReactNode) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement<{ children?: ReactNode; disabled?: boolean; value?: string | number }>(child)) return;
      if (child.type === "option") {
        const label = nodeText(child.props.children);
        options.push({
          disabled: Boolean(child.props.disabled),
          label,
          value: String(child.props.value ?? label),
        });
        return;
      }
      visit(child.props.children);
    });
  }

  visit(children);
  return options;
}

export function FluentSelect({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className = "",
  defaultValue,
  disabled,
  form,
  id,
  name,
  onChange,
  required,
  title,
  value,
}: FluentSelectProps) {
  const parsedOptions = useMemo(() => optionsFromChildren(children), [children]);
  const firstValue = parsedOptions.find((option) => !option.disabled)?.value ?? "";
  const controlledValue = value === undefined ? undefined : String(value);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(
    () => String(controlledValue ?? defaultValue ?? firstValue)
  );
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement>("below");
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    left: VIEWPORT_INSET,
    maxHeight: MAX_MENU_HEIGHT,
    top: VIEWPORT_INSET,
    width: 0,
  });
  const requestedValue = controlledValue ?? internalValue;
  const selectedValue = parsedOptions.some(
    (option) => option.value === requestedValue
  )
    ? requestedValue
    : firstValue;
  const selectedLabel =
    parsedOptions.find((option) => option.value === selectedValue)?.label ?? "";
  const fillsContainer = /(?:^|\s)(?:[a-z]+:)*w-full(?:\s|$)/.test(className);
  const isCompact = /text-(?:xs|\[10px\])/.test(className);
  const isLarge = /py-2\.5/.test(className);
  const maxWidth = /(?:^|\s)(?:[a-z]+:)*max-w-20(?:\s|$)/.test(className)
    ? "5rem"
    : undefined;

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const computed = window.getComputedStyle(button);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    let contentWidth = rect.width;

    if (context) {
      context.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      const longestLabel = parsedOptions.reduce(
        (longest, option) => Math.max(longest, context.measureText(option.label).width),
        0
      );
      // Check mark, option padding, and a small buffer for font rendering.
      contentWidth = Math.ceil(longestLabel + 68);
    }

    const layout = calculateSelectMenuLayout({
      contentWidth,
      optionCount: parsedOptions.length,
      trigger: rect,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });
    setMenuPlacement(layout.placement);
    setMenuPosition(layout.position);
  }, [parsedOptions]);

  const showMenu = useCallback(() => {
    if (disabled || parsedOptions.length === 0) return;
    updateMenuPosition();
    setOpen(true);
  }, [disabled, parsedOptions.length, updateMenuPosition]);

  useEffect(() => {
    const ownerForm = hiddenInputRef.current?.form;
    if (!ownerForm || controlledValue !== undefined) return;

    const reset = () => setInternalValue(String(defaultValue ?? firstValue));
    ownerForm.addEventListener("reset", reset);
    return () => ownerForm.removeEventListener("reset", reset);
  }, [controlledValue, defaultValue, firstValue]);

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => listboxRef.current?.focus());
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !listboxRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updateMenuPosition]);

  function selectOption(nextValue: string | undefined) {
    if (nextValue === undefined) return;
    if (controlledValue === undefined) setInternalValue(nextValue);
    const eventTarget = { name: name ?? "", value: nextValue } as EventTarget &
      HTMLSelectElement;
    onChange?.({
      currentTarget: eventTarget,
      target: eventTarget,
    } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  return (
    <>
      <div
        ref={rootRef}
        className="app-fluent-select"
        data-open={open || undefined}
        style={{
          maxWidth,
          minWidth: 0,
          width: fillsContainer ? "100%" : undefined,
        }}
      >
        <Button
          ref={buttonRef}
          id={id}
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={required || undefined}
          appearance="subtle"
          className={`app-fluent-select__button ${className}`}
          disabled={disabled}
          role="combobox"
          size={isCompact ? "small" : isLarge ? "large" : "medium"}
          title={title}
          onClick={() => {
            if (open) setOpen(false);
            else showMenu();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            } else if (
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              if (!open) showMenu();
            }
          }}
        >
          <span className="app-fluent-select__value">{selectedLabel}</span>
          <svg
            aria-hidden="true"
            className="app-fluent-select__chevron"
            width="18"
            height="18"
            viewBox="0 0 20 20"
          >
            <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
        </Button>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <Listbox
          ref={listboxRef}
          id={listboxId}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className="app-fluent-select__listbox"
          data-placement={menuPlacement}
          onOptionSelect={(_, data) => selectOption(data.optionValue)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              buttonRef.current?.focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          selectedOptions={[selectedValue]}
          style={menuPosition}
          tabIndex={-1}
        >
          {parsedOptions.map((option, index) => (
            <Option
              key={`${option.value}-${index}`}
              disabled={option.disabled}
              text={option.label}
              value={option.value}
            >
              {option.label}
            </Option>
          ))}
        </Listbox>,
        document.body
      )}
      <input
        ref={hiddenInputRef}
        disabled={disabled}
        form={form}
        name={name}
        type="hidden"
        value={selectedValue}
      />
    </>
  );
}
