/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * One description of the ⋯ menu, two renderers: the ⋯ button (CustomMenu,
 * submenus open on click — works on touch) and the right-click ContextMenu.
 * Entries come in groups; groups are separated by a thin line.
 */

import type { FC, ReactNode } from "react";
import { Check } from "lucide-react";
import type { TContextMenuItem } from "@plane/ui";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

export type TMenuIcon = FC<{ className?: string }>;

export type TMenuEntry = {
  key: string;
  title: string;
  icon?: TMenuIcon;
  /** A mark on the right: the current weight, frequency, module. */
  isSelected?: boolean;
  isDanger?: boolean;
  action?: () => void;
  /** A submenu (one level). */
  children?: TMenuEntry[];
};

export type TMenuGroup = { key: string; entries: TMenuEntry[] };

const ICON_CLASS = "size-3.5 shrink-0 text-icon-secondary";

function EntryRow({ entry }: { entry: TMenuEntry }) {
  const Icon = entry.icon;
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      {Icon && <Icon className={cn(ICON_CLASS, entry.isDanger && "text-danger-secondary")} />}
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      {entry.isSelected && <Check className="size-3.5 shrink-0 text-accent-primary" aria-label="выбрано" />}
    </span>
  );
}

// No font size here: `cn` (plain tailwind-merge) reads `text-12` as a colour
// and drops it next to `text-primary`. The size is set on the menu panels.
const ROW_CLASS = "flex items-center gap-2 text-primary";
/** Font size of the ⋯ panels (the menu and its submenus). */
export const MENU_TEXT_CLASS = "text-12";

const entryClass = (entry: TMenuEntry) => cn(ROW_CLASS, entry.isDanger && "text-danger-secondary");

/** Children of the ⋯ CustomMenu. */
export function WorkItemMenuItems({ groups }: { groups: TMenuGroup[] }) {
  const visible = groups.filter((group) => group.entries.length > 0);
  const rendered: ReactNode[] = [];
  visible.forEach((group, index) => {
    if (index > 0)
      rendered.push(<div key={`${group.key}-sep`} role="separator" className="my-1 border-t border-subtle-1" />);
    for (const entry of group.entries) {
      if (entry.children && entry.children.length > 0) {
        rendered.push(
          <CustomMenu.SubMenu
            key={entry.key}
            trigger={<EntryRow entry={entry} />}
            className={entryClass(entry)}
            contentClassName={`max-h-[min(24rem,70vh)] overflow-y-auto ${MENU_TEXT_CLASS}`}
          >
            {entry.children.map((child) => (
              <CustomMenu.MenuItem key={child.key} onClick={() => child.action?.()} className={entryClass(child)}>
                <EntryRow entry={child} />
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu.SubMenu>
        );
      } else {
        rendered.push(
          <CustomMenu.MenuItem key={entry.key} onClick={() => entry.action?.()} className={entryClass(entry)}>
            <EntryRow entry={entry} />
          </CustomMenu.MenuItem>
        );
      }
    }
  });
  return <>{rendered}</>;
}

const noop = () => {};

// A hairline above the first entry of a group, drawn outside the row so the
// hover background does not cover it.
const GROUP_START_CLASS =
  "relative mt-1.5 before:pointer-events-none before:absolute before:inset-x-0 before:-top-1 before:border-t before:border-subtle-1";

const toContextLeaf = (entry: TMenuEntry, className?: string): TContextMenuItem => ({
  key: entry.key,
  customContent: <EntryRow entry={entry} />,
  action: entry.action ?? noop,
  className: cn(entryClass(entry), className),
});

/** The same groups for the right-click ContextMenu. */
export const toContextMenuItems = (groups: TMenuGroup[]): TContextMenuItem[] =>
  groups
    .filter((group) => group.entries.length > 0)
    .flatMap((group, groupIndex) =>
      group.entries.map((entry, entryIndex) => {
        const className = groupIndex > 0 && entryIndex === 0 ? GROUP_START_CLASS : undefined;
        if (!entry.children || entry.children.length === 0) return toContextLeaf(entry, className);
        return {
          key: entry.key,
          title: entry.title,
          icon: entry.icon,
          iconClassName: ICON_CLASS,
          action: noop,
          className: cn(ROW_CLASS, className),
          nestedMenuItems: entry.children.map((child) => toContextLeaf(child)),
        };
      })
    );
