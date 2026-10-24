import { renderToStaticMarkup } from "react-dom/server";
import type { FormEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ props: null as null | { action: (data: FormData) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode } }));
vi.mock("@/components/platform/PlatformActionForm", () => ({
  PlatformActionForm: (props: NonNullable<typeof captured.props>) => { captured.props = props; return <form>{props.children}</form>; },
}));

import { IncidentForm } from "@/components/admin/IncidentForm";

const pageId = "22222222-2222-4222-8222-222222222222";
const componentId = "11111111-1111-4111-8111-111111111111";
const initial = {
  latestUpdateId: "33333333-3333-4333-8333-333333333333", latestEditedAt: "", name: "Payment outage", body: "Payments have recovered.",
  status: "RESOLVED", impact: "MAJOR", pageWide: false, backfilled: false, components: [{ componentId, status: "MAJOR_OUTAGE" }],
};
const components = [{ id: componentId, name: "Visa" }];

beforeEach(() => { captured.props = null; });

function submitEvent() {
  const preventDefault = vi.fn();
  const dispatchEvent = vi.fn();
  return { event: { preventDefault, currentTarget: { dispatchEvent } } as unknown as FormEvent<HTMLFormElement>, preventDefault, dispatchEvent };
}

describe("incident form validation and closed controls", () => {
  it("passes the server action directly and blocks an active form with no affected scope", () => {
    const action = vi.fn();
    renderToStaticMarkup(<IncidentForm action={action} pageId={pageId} components={components} initial={{ ...initial, status: "INVESTIGATING", components: [] }} />);
    expect(captured.props?.action).toBe(action);
    const event = submitEvent(); captured.props!.onSubmit(event.event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dispatchEvent).toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  it("allows a valid closed text correction to reach the form action", () => {
    const action = vi.fn();
    renderToStaticMarkup(<IncidentForm action={action} pageId={pageId} components={components} initial={initial} />);
    const event = submitEvent(); captured.props!.onSubmit(event.event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(captured.props?.action).toBe(action);
  });

  it("disables closed lifecycle fields while serializing their preserved values", () => {
    const html = renderToStaticMarkup(<IncidentForm action={vi.fn()} pageId={pageId} components={components} initial={{ ...initial, backfilled: true }} />);
    for (const label of ["Status", "Impact"]) expect(html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0]).toContain("disabled");
    expect(html.match(/<input[^>]*aria-label="Visa"[^>]*>/)?.[0]).toContain("disabled");
    for (const name of ["notify", "backfilled"]) expect(html.match(new RegExp(`<input[^>]*type="checkbox"[^>]*name="${name}"[^>]*>`))?.[0]).toContain("disabled");
    expect(html).toContain('type="hidden" name="status" value="RESOLVED"');
    expect(html).toContain('type="hidden" name="impact" value="MAJOR"');
    expect(html).toContain('type="hidden" name="backfilled" value="on"');
    expect(html).toContain(`type="hidden" name="componentIds" value="${componentId}"`);
  });
});
