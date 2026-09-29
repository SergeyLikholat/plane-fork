/**
 * «Принял» / «Вернул» menu of the row quick action.
 *
 * A small own popover instead of CustomMenu: the quick action sits inside a
 * `data-prevent-outside-click` wrapper (so pressing it does not close an open
 * peek), which CustomMenu reads as «click inside me» and never closes. Here any
 * pointerdown outside the button and the menu closes it — touch included, the
 * next row's hand included — as do Escape and scrolling.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCheck, Undo2 } from "lucide-react";

const MENU_WIDTH = 160;
const GAP = 4;

type Props = {
  buttonClassName: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onAccept: () => void;
  onReturn: () => void;
};

export function AcceptanceMenu({ buttonClassName, label, icon, disabled, onAccept, onReturn }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPosition({ top: rect.bottom + GAP, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const choose = (action: () => void) => () => {
    setIsOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        {icon}
      </button>
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-prevent-outside-click
            style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
            className="z-30 rounded-lg border border-subtle-1 bg-surface-1 p-1 shadow-raised-200"
          >
            <MenuItem icon={<CheckCheck className="size-3.5 text-icon-secondary" />} onSelect={choose(onAccept)}>
              Принял
            </MenuItem>
            <MenuItem icon={<Undo2 className="size-3.5 text-icon-secondary" />} onSelect={choose(onReturn)}>
              Вернул
            </MenuItem>
          </div>,
          document.body
        )}
    </>
  );
}

function MenuItem({ icon, onSelect, children }: { icon: ReactNode; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-xs-medium text-primary hover:bg-layer-1-hover focus-visible:bg-layer-1-hover focus-visible:outline-none"
    >
      {icon}
      {children}
    </button>
  );
}
