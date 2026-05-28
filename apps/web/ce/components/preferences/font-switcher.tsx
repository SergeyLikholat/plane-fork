/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { Check } from "lucide-react";
// plane imports
import { setPromiseToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// components
import {
  applyFontFamily,
  FONT_FAMILY_OPTIONS,
  DEFAULT_FONT_FAMILY_SLUG,
  type TFontFamilyOption,
} from "@/constants/fonts";
// hooks
import { useUserProfile } from "@/hooks/store/user";

/**
 * Sample text shown inside each font card so the user can see what the
 * font actually looks like in their own UI before committing. Mixes
 * Cyrillic + Latin + digits + punctuation deliberately — that's where
 * font differences read clearly on a Plane card.
 */
const SAMPLE_TEXT = "Подготовить отчёт · 28 мая · ТК-Инжиниринг";

export const FontSwitcher = observer(function FontSwitcher() {
  const { data: userProfile, updateUserProfile } = useUserProfile();

  const activeSlug = userProfile?.font_family || DEFAULT_FONT_FAMILY_SLUG;

  const handleSelect = useCallback(
    async (option: TFontFamilyOption) => {
      if (option.slug === activeSlug) return;
      // Apply optimistically so the user sees the font change instantly,
      // even if the network round-trip takes a moment.
      applyFontFamily(option.slug);
      const updatePromise = updateUserProfile({ font_family: option.slug });
      setPromiseToast(updatePromise, {
        loading: "Сохраняю шрифт…",
        success: { title: "Шрифт обновлён", message: () => `Применён «${option.name}»` },
        error: {
          title: "Ошибка",
          message: () => "Не удалось сохранить выбор шрифта",
        },
      });
      try {
        await updatePromise;
      } catch {
        // updateUserProfile already rolls back local state on failure;
        // revert the CSS variable too so the UI matches the saved value.
        applyFontFamily(activeSlug);
      }
    },
    [activeSlug, updateUserProfile]
  );

  return (
    <div className="grid grid-cols-1 gap-2">
      {FONT_FAMILY_OPTIONS.map((option) => {
        const isActive = option.slug === activeSlug;
        return (
          <button
            key={option.slug}
            type="button"
            onClick={() => {
              void handleSelect(option);
            }}
            className={cn(
              "group flex w-full flex-col items-start gap-1.5 rounded-lg border bg-surface-2 px-4 py-3 text-left transition-all",
              "hover:border-accent-primary/40 hover:bg-layer-transparent-hover",
              isActive
                ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary/30"
                : "border-subtle-1"
            )}
            // Inline style so the card renders in the target font for
            // a true visual preview. Tailwind's `font-*` utilities go
            // through `--font-body` which is shared with body text —
            // that wouldn't isolate the preview to this card.
            style={{ fontFamily: option.cssStack }}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-body-sm-medium text-primary">{option.name}</span>
              {isActive ? (
                <Check className="size-4 flex-shrink-0 text-accent-primary" strokeWidth={2.5} />
              ) : null}
            </div>
            <span className="text-caption-md-regular text-secondary">{option.description}</span>
            <span className="text-body-sm-regular text-primary">{SAMPLE_TEXT}</span>
          </button>
        );
      })}
    </div>
  );
});
