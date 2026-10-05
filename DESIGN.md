# SignalHub design system

Soft and vibrant, light only. A calm control plane for operators: generous radii, tinted icon tiles, layered soft shadows, short springy motion. Tokens live in `app/theme.css`; primitives live in `components/ui/`. This file is the contract for every screen.

## Shell

- **Icon rail** (64px, `components/admin/AdminShell.tsx`): one colour tile per section. **Context panel** (240px): the active section's links, org switcher on top, user card at the bottom. **Top strip:** breadcrumb, panel toggle, Ctrl/Cmd+K jump palette. **Mobile:** bottom tab bar plus a section sheet.
- Navigation data is `NAV_SECTIONS` in `components/admin/AdminNav.tsx`. A new screen goes there with a `hue` and an optional `capability`.
- Pages render inside `<main>`; do not add your own max-width wrapper or outer padding.

## Tokens (Tailwind utilities generated from `app/theme.css`)

| Use | Utility |
|---|---|
| Page canvas / card surface / inset surface | `bg-canvas` / `bg-surface` / `bg-sunken` |
| Hairline / stronger border | `border-line` / `border-line-strong` |
| Text: primary / secondary / dim | `text-ink` / `text-ink-soft` / `text-ink-dim` (dim is the lightest allowed for readable text) |
| Brand | `bg-primary`, `text-primary`, `text-primary-ink`, `bg-primary-soft`, `hover:bg-primary-hover` |
| Status | `text-ok-fg bg-ok-bg`, `text-warn-fg bg-warn-bg`, `text-danger-fg bg-danger-bg`, `text-info-fg bg-info-bg`; solids `bg-ok bg-warn bg-danger bg-info` |
| Radius | `rounded-chip` (6) `rounded-control` (10) `rounded-card` (16) `rounded-sheet` (20) `rounded-full` |
| Shadow | `shadow-card` `shadow-raised` `shadow-float` `shadow-primary` |
| Motion | `animate-fade` `animate-rise` `animate-pop` `animate-drop` `animate-shimmer`; `duration-200 ease-soft`; springy hover uses `ease-spring` |
| Fonts | Google Sans is the default; `font-mono` (Roboto Mono) only for IDs, tokens, URLs, code, slugs |

Type scale: `text-xs` 12, `text-sm` 14 (default body in dense UI), `text-base` 16, `text-lg` 18, `text-xl` 20, `text-2xl` 24, `text-3xl` 30; `text-2xs` is 11px and the smallest allowed. Weights 400, 500, 600. Headings use `font-semibold tracking-tight`. Never use arbitrary `text-[Npx]`.

Hues for icon tiles: `indigo sky emerald amber rose violet teal slate` (`Hue` type in `components/ui/icon-tile.tsx`). Section mapping: overview/pages indigo+violet, monitoring and metrics sky, incidents and maintenance amber, audience emerald, integrations and API teal, security rose, settings and help slate, platform violet.

## Primitives (`components/ui/`)

`Button` (variants `default secondary soft outline ghost destructive link`, sizes `default sm lg icon`, `loading`), `buttonVariants()` for link-styled buttons, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Label`, `Field` (label + hint + error), `Card/CardHeader/CardTitle/CardDescription/CardContent`, `Badge`, `StatusBadge` (tone `ok warn danger info neutral`, optional `live`), `Table*`, `Dialog*`, `Tooltip`, `Accordion*`, `IconTile`, `PageHeader`, `EmptyState`, `Skeleton`, `Alert` (tone `ok warn danger info`). Prop APIs are stable; do not change them in a feature change.

## Screen anatomy

1. `<div className="space-y-8">` root.
2. `PageHeader` with `title`, one-sentence `description`, `icon` + `hue` from the nav item, primary action in `actions`.
3. Content in `Card` blocks. A block header is `CardHeader` (`CardTitle`, optional `CardDescription`, optional right-aligned action). Group related fields in one card; do not create a card per field.
4. Forms: `Field` around each control, a `grid gap-4 sm:grid-cols-2` for short fields, one primary `Button` right-aligned in the card footer or below the fields. Destructive actions are `variant="destructive"` or a `ghost` with `hover:bg-danger-bg hover:text-danger-fg`, separated from the primary action.
5. Lists of records: `Table` for comparable columns; stacked rows (`rounded-control border border-line px-3.5 py-3`) for 1-2 facts per record; always handle the empty case with `EmptyState` (icon, what belongs here, a next-step action).
6. Feedback: success, error, and notices use `Alert`; status labels use `StatusBadge` (dot plus text, never colour alone).
7. A link that must look like a button: `<Link className={buttonVariants({ variant, size })}>`.

## Rules

- Replace legacy styling when you touch a file. Mapping: `bg-[var(--surface)]` to `bg-surface`; `bg-[var(--surface-raised)]` and `hover-overlay` to `bg-sunken`; `text-[var(--fg)]`, `--fg-soft`, `--fg-dim` to `text-ink`, `text-ink-soft`, `text-ink-dim`; `border-[var(--line)]` to `border-line`; `--line-bright` to `border-line-strong`; `--cyan` and `--blue` to `primary`; `--green`, `--amber`, `--red` to the status utilities above.
- Banned in new code: `font-mono` on headings or labels, `uppercase` with `tracking-*` eyebrows, `text-[Npx]`, `rounded-none`, hand-built card boxes (`border bg-[var(--surface)] p-4`), unicode glyphs as icons (`✓ ← → ↗`; use lucide icons with `aria-hidden`), inline `style` for colour except data-driven values.
- Icons are lucide-react only, `size={16}` in controls, `20` in tiles, no `strokeWidth` prop (a global rule sets 1.75). Pair a coloured `IconTile` with a section or a card heading when it helps scanning, not on every row.
- Copy: sentence case, plain verbs, name the outcome ("Save changes", not "Submit"), keep one name per action across the flow, use `…` and curly quotes, no exclamation marks. Errors say what failed and how to fix it. Do not change copy that tests, `lib/help-content.ts`, or `public/docs/user-manual.html` rely on unless you update them in the same change.
- Motion: hover and focus transitions only (`duration-200`), one `animate-fade` page entrance is already applied by the shell. No scattered fade-ins on cards. Everything must respect reduced motion (global rule in `theme.css`).
- Accessibility: visible focus ring (`focus-visible:ring-4 focus-visible:ring-primary/25`, already in primitives), 44px touch targets on mobile for primary controls, every input has a label, status never relies on colour alone, text contrast at least 4.5:1.
- Responsive: design for 390px first. No horizontal page scroll; tables sit in the `Table` wrapper which scrolls itself.
- Never change behaviour: server actions, data loading, authorization, routes, form field names, and ARIA/label text that tests assert stay as they are.

## Public status pages

Public pages render inside `.status-theme`, which re-points the same token utilities (`bg-surface`, `text-ink`, `bg-primary`) at the page owner's palette from the design editor (`lib/page-design.ts`, `PageDesignShell`). Use the same utilities there and never hardcode brand colours.

## Light only

There is no dark theme. Do not add `dark:` variants, theme toggles, or `prefers-color-scheme` rules.
