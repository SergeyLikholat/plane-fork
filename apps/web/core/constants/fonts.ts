/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Selectable UI fonts.
 *
 * Each option:
 *  - `slug` — stored in `Profile.font_family` on the backend
 *  - `name` — user-facing display name
 *  - `description` — short tagline (matches the picker style in the
 *    referenced source app)
 *  - `cssStack` — CSS `font-family` value applied to `--font-family-ui`
 *
 * `system` is intentionally first-class — it falls back to the OS native
 * UI font (SF Pro / Roboto / Segoe UI) without fetching anything.
 *
 * Order matches the order shown in the picker.
 */
export type TFontFamilyOption = {
  slug: string;
  name: string;
  description: string;
  cssStack: string;
};

export const DEFAULT_FONT_FAMILY_SLUG = "inter";

export const FONT_FAMILY_OPTIONS: ReadonlyArray<TFontFamilyOption> = [
  {
    slug: "system",
    name: "System",
    description: "Родной шрифт устройства (SF Pro / Roboto)",
    cssStack:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
  },
  {
    slug: "segoe-ui",
    // Segoe UI is Microsoft-proprietary — not on Google Fonts/fontsource,
    // can't be bundled. It IS preinstalled on Windows, so we reference the
    // locally-installed family with a graceful fallback to the native UI
    // font on devices that don't have it (macOS / Linux / Android).
    name: "Segoe UI",
    description: "Шрифт Windows (Microsoft) — привычный, нейтральный",
    cssStack: '"Segoe UI", -apple-system, system-ui, Roboto, sans-serif',
  },
  {
    slug: "inter",
    name: "Inter",
    description: "Профессиональный нейтральный — стандарт дашбордов",
    cssStack: '"Inter Variable", Inter, system-ui, sans-serif',
  },
  {
    slug: "geist",
    name: "Geist",
    description: "Vercel-флагман — ультрасовременный, у Linear-подобных",
    cssStack: '"Geist Variable", Geist, system-ui, sans-serif',
  },
  {
    slug: "figtree",
    name: "Figtree",
    description: "Дружелюбный geometric — отлично для to-do интерфейсов",
    cssStack: '"Figtree Variable", Figtree, system-ui, sans-serif',
  },
  {
    slug: "outfit",
    name: "Outfit",
    description: "Чистый минималистичный geometric",
    cssStack: '"Outfit Variable", Outfit, system-ui, sans-serif',
  },
  {
    slug: "sora",
    name: "Sora",
    description: "Гладкий geometric с плавными формами",
    cssStack: '"Sora Variable", Sora, system-ui, sans-serif',
  },
  {
    slug: "lexend",
    name: "Lexend",
    description: "Спроектирован для читаемости и фокуса",
    cssStack: '"Lexend Variable", Lexend, system-ui, sans-serif',
  },
  {
    slug: "plus-jakarta-sans",
    name: "Plus Jakarta Sans",
    description: "Премиум geometric, чувство дорогого продукта",
    cssStack: '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif',
  },
  {
    slug: "dm-sans",
    name: "DM Sans",
    description: "Мягкий геометрик, тёплый и современный",
    cssStack: '"DM Sans Variable", "DM Sans", system-ui, sans-serif',
  },
  {
    slug: "manrope",
    name: "Manrope",
    description: "Тёплый геометричный — отлично для health/UX",
    cssStack: '"Manrope Variable", Manrope, system-ui, sans-serif',
  },
  {
    slug: "onest",
    name: "Onest",
    description: "Свежий 2024, лёгкий, чистый",
    cssStack: '"Onest Variable", Onest, system-ui, sans-serif',
  },
  {
    slug: "public-sans",
    name: "Public Sans",
    description: "Утилитарный и профессиональный (шрифт правительства США)",
    cssStack: '"Public Sans Variable", "Public Sans", system-ui, sans-serif',
  },
  {
    slug: "ibm-plex-sans",
    name: "IBM Plex Sans",
    description: "Инженерная серьёзность, шрифт IBM",
    cssStack: '"IBM Plex Sans Variable", "IBM Plex Sans", system-ui, sans-serif',
  },
  {
    slug: "source-sans-3",
    name: "Source Sans 3",
    description: "Adobe — эталон читаемости в больших текстах",
    cssStack: '"Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif',
  },
  {
    slug: "pt-sans",
    name: "PT Sans",
    description: "Российский (Paratype), родной для кириллицы",
    cssStack: '"PT Sans", system-ui, sans-serif',
  },
  {
    slug: "spectral",
    name: "Spectral",
    description: "Premium serif — врачебно-журнальный",
    cssStack: 'Spectral, Georgia, "Times New Roman", serif',
  },
];

const SLUG_TO_OPTION: ReadonlyMap<string, TFontFamilyOption> = new Map(
  FONT_FAMILY_OPTIONS.map((o) => [o.slug, o])
);

export function resolveFontFamilyOption(slug: string | undefined | null): TFontFamilyOption {
  if (!slug) {
    return SLUG_TO_OPTION.get(DEFAULT_FONT_FAMILY_SLUG)!;
  }
  return SLUG_TO_OPTION.get(slug) ?? SLUG_TO_OPTION.get(DEFAULT_FONT_FAMILY_SLUG)!;
}

/**
 * Apply the chosen font globally via a CSS variable on `<html>`. The
 * variable is consumed by `body { font-family: var(--font-family-ui) }`
 * in `globals.css`. Setting it on `documentElement` (not `body`) ensures
 * any portal'd content (date picker, command palette, dropdowns rendered
 * to `document.body`) inherits it too.
 */
export function applyFontFamily(slug: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const option = resolveFontFamilyOption(slug);
  document.documentElement.style.setProperty("--font-family-ui", option.cssStack);
}
