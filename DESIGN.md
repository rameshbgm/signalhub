---
name: SignalHub
description: A shared control horizon for self-hosted status operations.
colors:
  midnight: "#0c1828"
  deep-surface: "#12243a"
  raised-surface: "#17304a"
  porcelain: "#f3f1e9"
  signal-lime: "#d7ef4b"
  healthy: "#a5e76a"
  caution: "#f6c35f"
  incident: "#ff7460"
  route-blue: "#79b9ee"
typography:
  display:
    fontFamily: "Arial Narrow, Roboto Condensed, Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(2.7rem, 6vw, 5.6rem)"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.065em"
  body:
    fontFamily: "Arial Narrow, Roboto Condensed, Avenir Next, Segoe UI, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.5
  label:
    fontFamily: "SFMono-Regular, Roboto Mono, Consolas, monospace"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.16em"
rounded:
  command: "0px"
spacing:
  strip: "8px"
  field: "16px"
  deck: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-lime}"
    textColor: "#132339"
    rounded: "{rounded.command}"
    padding: "12px 16px"
  input-default:
    backgroundColor: "rgba(6, 17, 30, 0.44)"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.command}"
    padding: "12px 16px"
---

# Design System: SignalHub

## Overview

**Creative North Star: "Dispatch Strip Wall"**

SignalHub is an operations tool, not a decorative dashboard. The UI reads as a shared control horizon: current condition and actions occupy the broad work field, while a persistent left Signal Rail keeps routes immediately reachable. Status surfaces carry the same precision while continuing to honor each page owner’s palette and presentation choices.

Key characteristics:

- Dark midnight enamel for signed-in operations; owner-selected palettes remain authoritative on public pages.
- Fine route lines and square, mechanical dividers establish structure instead of floating rounded cards.
- Signal-lime is scarce: reserve it for live, selected, confirmed, or primary action states.

## Colors

The palette is a controlled night shift: cool navy structure, warm porcelain reading text, and restrained signal colors for meaningful state.

### Primary

- **Signal Lime** (`#d7ef4b`): selection, live indicators, confirmed operational state, and primary actions.
- **Route Blue** (`#79b9ee`): secondary information and non-urgent navigational emphasis.

### Neutral

- **Midnight Enamel** (`#0c1828`): canvas and broad operating field.
- **Deep Surface** (`#12243a`): command deck and durable container surface.
- **Raised Surface** (`#17304a`): quiet interactive elevation.
- **Porcelain** (`#f3f1e9`): primary text on dark operational surfaces.

**The Signal Rule.** Do not use lime as decoration. It must describe a real selection, confirmation, live system state, or primary commit action.

## Typography

**Display Font:** Arial Narrow / Roboto Condensed / Avenir Next / Segoe UI, sans-serif.
**Body Font:** Arial Narrow / Roboto Condensed / Avenir Next / Segoe UI, sans-serif.
**Label/Mono Font:** SFMono-Regular / Roboto Mono / Consolas, monospace.

Display type is tightly tracked and decisive. Monospace is an operational annotation layer for checkpoints, labels, dates, and state — never a substitute for every paragraph.

### Hierarchy

- **Display** (600, `clamp(2.7rem, 6vw, 5.6rem)`, 0.9): first-view entry and high-priority public messaging.
- **Headline** (600, 1.8–3rem, 1.05): page condition and key operating focus.
- **Body** (400, 1rem, 1.5): explanatory information and form help.
- **Label** (700, 0.56–0.7rem, uppercase, `0.16em`): deck groups, checkpoints, and metadata.

## Layout

On wide screens, the persistent left Signal Rail groups routes by operating domain and keeps them visible as compact vertical strips. Main content uses the remaining broad work field with a short signal line at its origin, then allows each operational screen to use the width it needs.

On small screens, the command deck becomes a compact drawer with two-column route links. Forms must remain at least 1rem text size and no route, hostname, or identifier may force horizontal scrolling.

## Elevation & Depth

Depth is conveyed through tonal layering, rules, and the route grid rather than soft shadows. The command deck has one purposeful ambient shadow to hold it above the operating field; ordinary pages, cards, and strip rows are flat.

## Shapes

Square edges are the default. Borders are thin mechanical dividers, not decorative containers. Do not introduce pill controls or soft, large-radius card grids into the operations console. Public pages may use their owner-defined radius settings.

## Components

### Buttons

- **Primary:** signal-lime fill, midnight text, square corners, concise label.
- **Secondary:** transparent or deep-surface fill with a visible rule.
- **Focus:** a two-pixel lime outline with separation from the component edge.

### Cards / Containers

- **Style:** flat deep surfaces divided by one-pixel rules.
- **Use:** group related information only; prefer strip rows and spacing where a container adds no meaning.

### Inputs / Fields

- **Style:** square fields on a translucent midnight input surface.
- **Focus:** lime border and a quiet lime halo.
- **States:** keep error coral and disabled text visibly muted without removing legibility.

### Navigation

- **Left Signal Rail:** group label above direct vertical route links; selected route receives the lime field.
- **Mobile:** compact drawer with grouped, two-column routes and the same selected-state language.

## Do's and Don'ts

- Do keep the current operational condition and the actions that change it close together.
- Do use lines, labels, and repeatable strip rhythm to create hierarchy.
- Do preserve public-page owner controls and custom palettes.
- Don't turn the Signal Rail into a generic icon-only sidebar or hide routine routes behind nested menus.
- Don't use generic soft shadows, glass cards, neon effects, or decorative gradients as the primary visual language.
- Don't use lime, amber, or coral solely to make a screen feel colorful.
