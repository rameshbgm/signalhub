import type { CSSProperties } from "react";

/** Public-page theme variables that overlays need once they render outside the page tree. */
const THEME_VARIABLES = [
  "--bg", "--surface", "--fg", "--fg-soft", "--fg-dim", "--line", "--line-bright",
  "--cyan", "--red", "--amber", "--amber-soft", "--blue", "--green",
  "--page-brand", "--page-accent", "--page-radius", "--page-shadow",
];

/**
 * Overlays are portaled to <body> because a transformed ancestor (page panels,
 * custom CSS) would otherwise trap `position: fixed`. Copying the computed
 * theme variables keeps them styled like the page they came from.
 */
export function themeVariables(element: Element): CSSProperties {
  const computed = getComputedStyle(element);
  return Object.fromEntries(
    THEME_VARIABLES.map((name) => [name, computed.getPropertyValue(name)]).filter(([, value]) => value)
  ) as CSSProperties;
}
