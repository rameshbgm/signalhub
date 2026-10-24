import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as null | { userId: string }, query: vi.fn(() => { throw new Error("Workspace welcome must not query application data"); }) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => state.session }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/postgres/client", () => ({ database: { selectFrom: state.query } }));

import Home, { generateMetadata } from "@/app/page";
import { instanceBranding } from "@/lib/instance-branding";

beforeEach(() => { state.session = null; state.query.mockClear(); vi.unstubAllEnvs(); });

describe("workspace welcome", () => {
  it("offers only workspace sign-in without fetching or showing application data", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Welcome to your");
    expect(html).toContain("Sign in to workspace");
    expect(html).toContain('href="/login"');
    expect(html).not.toMatch(/Public services|Public status pages|Active incidents|Maintenance|Refresh status|Payment Health|Estora/);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("continues signed-in users to their workspace", async () => {
    state.session = { userId: "user" };
    await expect(Home()).rejects.toThrow("redirect:/organization");
    expect(state.query).not.toHaveBeenCalled();
  });

  it("uses installation branding and excludes the welcome page from search indexing", () => {
    vi.stubEnv("SIGNALHUB_INSTANCE_NAME", "Acme Operations");
    expect(generateMetadata()).toMatchObject({ title: "Acme Operations — Workspace", robots: { index: false, follow: false } });
    expect(instanceBranding({ SIGNALHUB_INSTANCE_LOGO_URL: "https://example.test/logo.svg" })).toEqual({ name: "SignalHub", logoUrl: "https://example.test/logo.svg" });
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,test", "//example.test/logo.svg", ""])("rejects unsupported branding URL %s", (url) => {
    expect(instanceBranding({ SIGNALHUB_INSTANCE_LOGO_URL: url }).logoUrl).toBeNull();
  });
});
