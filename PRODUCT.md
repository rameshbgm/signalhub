# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SignalHub serves the people who operate and communicate the condition of digital services: organization administrators, incident managers, responders, platform administrators, and the customers or employees who consult published status pages.

## Product Purpose

SignalHub is a self-hosted status-page, monitoring, and incident-communication platform. Teams create public or private status experiences, monitor services, coordinate incidents and maintenance, and deliver updates to subscribers while operating on infrastructure they control.

## Positioning

SignalHub combines the public communication surface and the operational control plane in a self-hosted, Apache-2.0 product. Status history, monitoring, subscriber communication, identity, governance, and audit evidence remain under the operator’s control rather than a hosted vendor control plane.

## Operating Context

Administrators configure pages, components, subscribers, monitors, notification destinations, and access. Responders declare incidents, publish updates, and schedule maintenance. Visitors consult status, history, metrics, and incident details or subscribe for notifications. Platform administrators govern organizations, identity, operations, retention, and audit evidence.

## Capabilities and Constraints

- The product has public, private, audience-scoped, and hub status pages.
- It supports incident lifecycles, maintenance, HTTP/TCP/DNS/SSL/ICMP/heartbeat monitoring, metrics, subscriber delivery, API keys, feeds, embeds, enterprise identity, multi-organization administration, and audit tooling.
- Product behavior, terminology, authorization, public accessibility, and responsive operation must remain intact through the redesign.
- Production uses PostgreSQL and a Next.js web interface with server-side authorization.

## Brand Commitments

- Product name: SignalHub.
- Current project language emphasizes ownership of signal, data, infrastructure, and response.
- The user explicitly requires a complete visual replacement across every SignalHub page and component; current visual styles, layouts, alignments, and navigation patterns are not design authority.

## Evidence on Hand

- Product capabilities and operational claims are documented in `README.md` and implemented throughout `app/`, `components/`, `lib/`, and `worker/`.
- Existing product name and public landing copy are available in `components/landing/LandingPage.tsx`.
- No new customer endorsements, benchmarks, pricing claims, or product capabilities may be invented for the redesign.

## Product Principles

- Make operational state legible under pressure.
- Keep public communication trustworthy, calm, and easy to scan.
- Let self-hosted control and governance feel tangible rather than abstract.
- Preserve clear boundaries between public visitors, organization operators, and platform administration.
- Make complex administration feel deliberate without hiding the underlying capability.

## Accessibility & Inclusion

Preserve semantic HTML, keyboard operation, focus visibility, readable contrast, responsive layouts, and reduced-motion support across public and authenticated surfaces.
