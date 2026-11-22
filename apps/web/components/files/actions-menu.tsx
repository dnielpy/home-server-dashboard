"use client";

import { useEffect, useId, useRef, type ToggleEvent } from "react";

import { BUTTON, BUTTON_TONES } from "./files-client";

export type MenuAction = {
  label: string;
  /** A link the browser downloads instead of a button. */
  href?: string;
  onSelect?: () => void;
  tone?: "red";
  disabled?: boolean;
  /** Why it is disabled, on hover. */
  hint?: string;
};

// Below the button unless it is low on the screen, then above it
const FLIP_AT = 0.6;

/**
 * A "⋯" button that opens a list of actions. The list is a popover, in the top layer, so the panel's rounded clip does
 * not cut it; it closes on a click outside, Escape, a scroll, or picking an action.
 */
export function ActionsMenu({ label, actions, disabled }: { label: string; actions: MenuAction[]; disabled?: boolean }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => menu.current?.matches(":popover-open") && menu.current.hidePopover();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  function place(event: ToggleEvent<HTMLDivElement>) {
    const rect = button.current?.getBoundingClientRect();
    if (event.newState !== "open" || !rect) return;
    const style = event.currentTarget.style;
    style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    if (rect.bottom > window.innerHeight * FLIP_AT) {
      style.top = "auto";
      style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      style.bottom = "auto";
      style.top = `${rect.bottom + 4}px`;
    }
  }

  function pick(action: MenuAction) {
    menu.current?.hidePopover();
    action.onSelect?.();
  }

  const item =
    "flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`${BUTTON} ${BUTTON_TONES.neutral} px-1.5`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label={label}
        onBeforeToggle={place}
        className="fixed inset-auto m-0 min-w-44 rounded-xl border border-surface-border bg-background p-1 text-foreground shadow-xl"
      >
        {actions.map((action) =>
          action.href && !action.disabled ? (
            <a
              key={action.label}
              role="menuitem"
              href={action.href}
              download
              onClick={() => pick({ ...action, onSelect: undefined })}
              className={item}
            >
              {action.label}
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              title={action.disabled ? action.hint : undefined}
              onClick={() => pick(action)}
              className={`${item} ${action.tone === "red" ? "text-red-600 dark:text-red-400" : ""}`}
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
