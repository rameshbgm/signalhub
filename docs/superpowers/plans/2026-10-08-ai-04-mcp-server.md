# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose SignalHub to AI clients (Claude, Cursor, internal agents) as a Model Context Protocol server at `POST /api/mcp`, authenticated with the existing scoped API keys, so an operator can ask their AI client to list components, list incidents, open an incident, or post an update.

**Architecture:** The official MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) owns the protocol (it serves both the current 2026-07-28 revision and 2025-era clients statelessly). SignalHub contributes: (1) a tool registry `lib/mcp/tools.ts` with scope and page-scope enforcement, written against an injected `ToolDeps` so it is tested without a database; (2) `lib/mcp/server.ts`, which registers only the tools the API key's scopes allow; (3) `lib/mcp/deps.ts`, thin database wiring that calls the same domain functions as the REST API; (4) `app/api/mcp/route.ts`, which authenticates the key, rate-limits, checks `Origin`, and hands the request to the SDK. No LLM runs inside SignalHub for this feature: the client brings the model.

**Tech Stack:** `@modelcontextprotocol/server@2.3.1` (Apache-2.0; depends on `zod ^4`, already in the repo), Next.js route handler, Vitest.

**Spec:** `AI-FEATURE-IDEAS.txt` (D1 MCP server). **Depends on:** nothing from Plans 1-3.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before writing the route (project `AGENTS.md`).
- Authentication is the existing `authenticateApiKey` (Bearer token, revoked/expired/CIDR/organization-state checks). A tool is registered only if the key's `scopes` contain the tool's scope; keys limited to certain pages (`pageIds`) can only touch those pages, exactly like `apiKeyAllowsPage`.
- Write tools default `notify` to **false**. REST defaults to true; an AI client opening a public incident that emails every subscriber is higher risk, so the model must opt in.
- Writes are recorded in the tenant audit log as actor `api-key:<key id>` with action `MCP_CREATE_INCIDENT` or `MCP_UPDATE_INCIDENT` (best effort after the write; the REST routes do not audit at all).
- Rate limit 120 requests per minute per API key.
- Origin check (MCP spec, DNS-rebinding protection): a request with an `Origin` header is accepted only if it matches `NEXT_PUBLIC_APP_URL`'s origin. Non-browser clients send no `Origin`.
- Unexpected errors return a generic message to the model and are logged; internal error text never reaches the client.
- Tool inputs are validated by zod schemas (the SDK validates before the handler runs; handlers parse again so they are safe to test directly).

## Review Focus

1. A key without write scopes must not even see write tools, and calling one by name must fail (Task 3 tests).
2. A page-restricted key must not read, create, or update anything outside its pages, including by guessing an incident id on another page (Task 2 and Task 3 tests).
3. The model passes `notify: true` by accident or omits it: default must be false (Task 2 test).
4. Internal errors (database down, bug) must not leak text to the client (Task 3 test).
5. A browser page on another origin POSTing with a stolen or pasted key (Task 1 origin check).
6. A newer MCP client sends the 2026-07-28 envelope; an older one sends `initialize`. Both must work (Task 4 manual check with both request shapes).

---

### Task 1: Dependency and Origin check

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Create: `lib/mcp/origin.ts`
- Test: `tests/mcp-origin.test.ts`

**Interfaces:**
- Produces: `originAllowed(origin: string | null, appUrl: string | undefined): boolean`

- [ ] **Step 1: Install the SDK**

Run: `npm install @modelcontextprotocol/server@2.3.1`
Expected: `package.json` gains `"@modelcontextprotocol/server": "^2.3.1"`. (The published `.d.mts` references `Buffer`; this repo already has `@types/node`, so no tsconfig change is needed. If `tsc` later complains about `Buffer`, add `"types": ["node"]` to `compilerOptions`.)

- [ ] **Step 2: Write the failing tests**

`tests/mcp-origin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { originAllowed } from "../lib/mcp/origin";

describe("originAllowed", () => {
  const appUrl = "https://status.example.com";

  it("accepts requests without an Origin header (non-browser clients)", () => {
    expect(originAllowed(null, appUrl)).toBe(true);
    expect(originAllowed(null, undefined)).toBe(true);
  });

  it("accepts the application's own origin, ignoring path and trailing slash", () => {
    expect(originAllowed("https://status.example.com", "https://status.example.com/")).toBe(true);
    expect(originAllowed("https://status.example.com", "https://status.example.com/base")).toBe(true);
  });

  it("rejects any other origin", () => {
    expect(originAllowed("https://evil.example.net", appUrl)).toBe(false);
    expect(originAllowed("http://status.example.com", appUrl)).toBe(false);
    expect(originAllowed("https://status.example.com:8443", appUrl)).toBe(false);
  });

  it("rejects an Origin when the application URL is not configured, and malformed origins", () => {
    expect(originAllowed("https://status.example.com", undefined)).toBe(false);
    expect(originAllowed("null", appUrl)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/mcp-origin.test.ts`
Expected: FAIL, "Failed to resolve import ../lib/mcp/origin".

- [ ] **Step 4: Implement**

`lib/mcp/origin.ts`:

```ts
/** MCP requires servers to reject unexpected Origin headers (DNS rebinding). Non-browser clients send none. */
export function originAllowed(origin: string | null, appUrl: string | undefined) {
  if (!origin) return true;
  if (!appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run to verify pass, then commit**

Run: `npx vitest run tests/mcp-origin.test.ts`
Expected: PASS (4 tests).

```bash
git add package.json package-lock.json lib/mcp/origin.ts tests/mcp-origin.test.ts
git commit -m "feat: MCP SDK dependency and Origin check"
```

---

### Task 2: Tool registry with scope and page enforcement

**Files:**
- Create: `lib/mcp/tools.ts`
- Test: `tests/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `COMPONENT_STATUSES`, `IMPACTS`, `INCIDENT_STATUSES` from `lib/status.ts`; type `ApiKeyScope` from `lib/postgres/schema.ts`.
- Produces:
  - `type McpPrincipal = { orgId: string; apiKeyId: string; scopes: readonly string[]; pageIds: readonly string[] | null }`
  - `class McpToolError extends Error` (message is safe to show the client)
  - `type ToolDeps` (see code: `listComponents`, `listIncidents`, `incidentPageId`, `createIncident`, `addIncidentUpdate`, `audit`)
  - `type ToolDefinition = { name; title; description; scope: ApiKeyScope; readOnly: boolean; inputSchema; run(principal, args: unknown): Promise<unknown> }`
  - `createTools(deps: ToolDeps): ToolDefinition[]` returning `list_components`, `list_incidents`, `create_incident`, `post_incident_update`
  - `visibleTools(tools: ToolDefinition[], principal: McpPrincipal): ToolDefinition[]`

- [ ] **Step 1: Write the failing tests**

`tests/mcp-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTools, McpToolError, visibleTools, type McpPrincipal, type ToolDeps } from "../lib/mcp/tools";

const PAGE_A = "11111111-1111-4111-8111-111111111111";
const PAGE_B = "22222222-2222-4222-8222-222222222222";
const COMPONENT = "33333333-3333-4333-8333-333333333333";
const INCIDENT = "44444444-4444-4444-8444-444444444444";

function fakeDeps(overrides: Partial<ToolDeps> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = <T,>(name: string, value: T) => async (...args: unknown[]) => {
    calls.push({ name, args });
    return value;
  };
  const deps: ToolDeps = {
    listComponents: record("listComponents", { pages: [] }) as ToolDeps["listComponents"],
    listIncidents: record("listIncidents", { incidents: [] }) as ToolDeps["listIncidents"],
    incidentPageId: record("incidentPageId", PAGE_A) as ToolDeps["incidentPageId"],
    createIncident: record("createIncident", { id: "new-incident" }) as ToolDeps["createIncident"],
    addIncidentUpdate: record("addIncidentUpdate", { id: "new-update" }) as ToolDeps["addIncidentUpdate"],
    audit: record("audit", undefined) as ToolDeps["audit"],
    ...overrides,
  };
  return { deps, calls };
}

const principal = (overrides: Partial<McpPrincipal> = {}): McpPrincipal => ({
  orgId: "org-1",
  apiKeyId: "key-1",
  scopes: ["components.read", "incidents.read", "incidents.write"],
  pageIds: null,
  ...overrides,
});

const tool = (name: string, deps: ToolDeps) => createTools(deps).find((candidate) => candidate.name === name)!;

describe("visibleTools", () => {
  it("shows only the tools the key's scopes allow", () => {
    const { deps } = fakeDeps();
    const names = (scopes: string[]) => visibleTools(createTools(deps), principal({ scopes })).map((candidate) => candidate.name);
    expect(names(["components.read", "incidents.read"])).toEqual(["list_components", "list_incidents"]);
    expect(names(["incidents.write"])).toEqual(["create_incident", "post_incident_update"]);
    expect(names([])).toEqual([]);
  });

  it("marks reading tools read-only and writing tools not", () => {
    const { deps } = fakeDeps();
    const byName = Object.fromEntries(createTools(deps).map((candidate) => [candidate.name, candidate.readOnly]));
    expect(byName).toEqual({ list_components: true, list_incidents: true, create_incident: false, post_incident_update: false });
  });
});

describe("page scope", () => {
  it("refuses to read a page outside a restricted key", async () => {
    const { deps, calls } = fakeDeps();
    await expect(tool("list_components", deps).run(principal({ pageIds: [PAGE_A] }), { pageId: PAGE_B })).rejects.toThrow(new McpToolError("Page not found"));
    expect(calls).toEqual([]);
  });

  it("passes a restricted key's pages to the query so unfiltered reads cannot see other pages", async () => {
    const { deps, calls } = fakeDeps();
    await tool("list_incidents", deps).run(principal({ pageIds: [PAGE_A] }), {});
    expect(calls[0]).toEqual({ name: "listIncidents", args: ["org-1", [PAGE_A], { pageId: undefined, openOnly: true }] });
  });

  it("treats an empty page list like no restriction, as the REST API does", async () => {
    const { deps, calls } = fakeDeps();
    await tool("list_components", deps).run(principal({ pageIds: [] }), {});
    expect(calls[0].args).toEqual(["org-1", null, undefined]);
  });

  it("refuses to create an incident on a page outside the key", async () => {
    const { deps, calls } = fakeDeps();
    const input = { pageId: PAGE_B, name: "Down", impact: "MAJOR", body: "We are investigating.", components: [{ componentId: COMPONENT, status: "MAJOR_OUTAGE" }] };
    await expect(tool("create_incident", deps).run(principal({ pageIds: [PAGE_A] }), input)).rejects.toThrow("Page not found");
    expect(calls).toEqual([]);
  });

  it("hides incidents on other pages exactly like missing ones", async () => {
    const { deps, calls } = fakeDeps({ incidentPageId: async () => PAGE_B });
    await expect(tool("post_incident_update", deps).run(principal({ pageIds: [PAGE_A] }), { incidentId: INCIDENT, status: "IDENTIFIED", body: "Found it." })).rejects.toThrow("Incident not found");
    expect(calls).toEqual([]);
  });

  it("reports an unknown incident as not found", async () => {
    const { deps } = fakeDeps({ incidentPageId: async () => null });
    await expect(tool("post_incident_update", deps).run(principal(), { incidentId: INCIDENT, status: "IDENTIFIED", body: "Found it." })).rejects.toThrow("Incident not found");
  });
});

describe("writes", () => {
  const input = { pageId: PAGE_A, name: "Checkout errors", impact: "MAJOR", body: "We are investigating.", components: [{ componentId: COMPONENT, status: "MAJOR_OUTAGE" }] };

  it("does not notify subscribers unless the model asks", async () => {
    const { deps, calls } = fakeDeps();
    const result = await tool("create_incident", deps).run(principal(), input);
    expect(result).toEqual({ id: "new-incident", notified: false });
    const created = calls.find((call) => call.name === "createIncident")!.args[1] as { notify: boolean; status: string; pageWide: boolean };
    expect(created).toMatchObject({ notify: false, status: "INVESTIGATING", pageWide: false });
  });

  it("notifies when explicitly requested", async () => {
    const { deps, calls } = fakeDeps();
    await tool("create_incident", deps).run(principal(), { ...input, notify: true });
    expect((calls.find((call) => call.name === "createIncident")!.args[1] as { notify: boolean }).notify).toBe(true);
  });

  it("records an audit entry naming the key after a successful write", async () => {
    const { deps, calls } = fakeDeps();
    await tool("post_incident_update", deps).run(principal(), { incidentId: INCIDENT, status: "IDENTIFIED", body: "Found it." });
    expect(calls.find((call) => call.name === "audit")!.args).toEqual([principal(), "MCP_UPDATE_INCIDENT", INCIDENT]);
    const update = calls.find((call) => call.name === "addIncidentUpdate")!.args;
    expect(update).toEqual(["org-1", INCIDENT, { status: "IDENTIFIED", body: "Found it.", notify: false }]);
  });

  it("does not audit a write that failed", async () => {
    const { deps, calls } = fakeDeps({
      createIncident: async () => {
        throw new Error("Page not found");
      },
    });
    await expect(tool("create_incident", deps).run(principal(), input)).rejects.toBeInstanceOf(McpToolError);
    expect(calls.some((call) => call.name === "audit")).toBe(false);
  });

  it("lets unexpected errors through unchanged for the server layer to hide", async () => {
    const { deps } = fakeDeps({
      createIncident: async () => {
        throw new Error("connection to 10.0.0.5:5432 refused");
      },
    });
    const failure = await tool("create_incident", deps).run(principal(), input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(McpToolError);
  });

  it("rejects invalid input before touching the database", async () => {
    const { deps, calls } = fakeDeps();
    await expect(tool("create_incident", deps).run(principal(), { ...input, impact: "HUGE" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/mcp-tools.test.ts`
Expected: FAIL, "Failed to resolve import ../lib/mcp/tools".

- [ ] **Step 3: Implement**

`lib/mcp/tools.ts`:

```ts
import { z } from "zod";
import { COMPONENT_STATUSES, IMPACTS, INCIDENT_STATUSES } from "@/lib/status";
import type { ApiKeyScope } from "@/lib/postgres/schema";

export type McpPrincipal = {
  orgId: string;
  apiKeyId: string;
  scopes: readonly string[];
  /** null or empty means every page in the organization, as for the REST API. */
  pageIds: readonly string[] | null;
};

/** A failure whose message is safe and useful to show the AI client. Anything else is hidden. */
export class McpToolError extends Error {}

type IncidentInput = {
  pageId: string;
  name: string;
  status: (typeof INCIDENT_STATUSES)[number];
  impact: (typeof IMPACTS)[number];
  body: string;
  notify: boolean;
  pageWide: boolean;
  components: { componentId: string; status: (typeof COMPONENT_STATUSES)[number] }[];
};

type UpdateInput = { status: (typeof INCIDENT_STATUSES)[number]; body: string; notify: boolean };

export type ToolDeps = {
  listComponents(orgId: string, pageIds: readonly string[] | null, pageId?: string): Promise<unknown>;
  listIncidents(orgId: string, pageIds: readonly string[] | null, options: { pageId?: string; openOnly: boolean }): Promise<unknown>;
  /** The page an incident belongs to inside this organization, or null. */
  incidentPageId(orgId: string, incidentId: string): Promise<string | null>;
  createIncident(orgId: string, input: IncidentInput): Promise<{ id: string }>;
  addIncidentUpdate(orgId: string, incidentId: string, input: UpdateInput): Promise<{ id: string }>;
  /** Best effort; must never throw. */
  audit(principal: McpPrincipal, action: string, target: string): Promise<void>;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  scope: ApiKeyScope;
  readOnly: boolean;
  inputSchema: z.ZodObject;
  run(principal: McpPrincipal, args: unknown): Promise<unknown>;
};

function tool<Schema extends z.ZodObject>(
  definition: Omit<ToolDefinition, "run" | "inputSchema"> & {
    inputSchema: Schema;
    run(principal: McpPrincipal, args: z.output<Schema>): Promise<unknown>;
  }
): ToolDefinition {
  // async so invalid input rejects instead of throwing synchronously
  return { ...definition, run: async (principal, args) => definition.run(principal, definition.inputSchema.parse(args)) };
}

const pageAllowed = (principal: McpPrincipal, pageId: string) => !principal.pageIds?.length || principal.pageIds.includes(pageId);
const scopedPages = (principal: McpPrincipal) => (principal.pageIds?.length ? principal.pageIds : null);

/** The domain layer's own "not found" and component-scope messages are safe to show; everything else is not. */
async function domainCall<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && /Page not found|Incident not found|component/i.test(error.message)) {
      throw new McpToolError(error.message);
    }
    throw error;
  }
}

const id = (description: string) => z.uuid().describe(description);
const notifyField = z.boolean().default(false).describe("Email and message subscribers. Leave false unless the user asked to notify them.");

export function createTools(deps: ToolDeps): ToolDefinition[] {
  return [
    tool({
      name: "list_components",
      title: "List components",
      description: "List status pages with the current status of each component.",
      scope: "components.read",
      readOnly: true,
      inputSchema: z.object({ pageId: id("Only this status page").optional() }),
      run: async (principal, { pageId }) => {
        if (pageId && !pageAllowed(principal, pageId)) throw new McpToolError("Page not found");
        return deps.listComponents(principal.orgId, scopedPages(principal), pageId);
      },
    }),
    tool({
      name: "list_incidents",
      title: "List incidents",
      description: "List recent incidents with their latest updates and affected components.",
      scope: "incidents.read",
      readOnly: true,
      inputSchema: z.object({
        pageId: id("Only this status page").optional(),
        openOnly: z.boolean().default(true).describe("Only incidents that are not resolved"),
      }),
      run: async (principal, { pageId, openOnly }) => {
        if (pageId && !pageAllowed(principal, pageId)) throw new McpToolError("Page not found");
        return deps.listIncidents(principal.orgId, scopedPages(principal), { pageId, openOnly });
      },
    }),
    tool({
      name: "create_incident",
      title: "Create incident",
      description:
        "Open a public incident on a status page. Needs the page id and the affected components (or pageWide). Subscribers are not notified unless notify is true.",
      scope: "incidents.write",
      readOnly: false,
      inputSchema: z.object({
        pageId: id("Status page"),
        name: z.string().trim().min(1).max(200).describe("Short public title"),
        status: z.enum(INCIDENT_STATUSES).default("INVESTIGATING"),
        impact: z.enum(IMPACTS),
        body: z.string().trim().min(1).max(20_000).describe("Public first update, plain language"),
        components: z
          .array(z.object({ componentId: id("Component"), status: z.enum(COMPONENT_STATUSES) }))
          .default([])
          .describe("Affected components and the status to set on each"),
        pageWide: z.boolean().default(false).describe("Affects the whole page instead of specific components"),
        notify: notifyField,
      }),
      run: async (principal, input) => {
        if (!pageAllowed(principal, input.pageId)) throw new McpToolError("Page not found");
        const incident = await domainCall(() => deps.createIncident(principal.orgId, input));
        await deps.audit(principal, "MCP_CREATE_INCIDENT", incident.id);
        return { id: incident.id, notified: input.notify };
      },
    }),
    tool({
      name: "post_incident_update",
      title: "Post incident update",
      description: "Add a public update to an open incident and move it to the given status. Subscribers are not notified unless notify is true.",
      scope: "incidents.write",
      readOnly: false,
      inputSchema: z.object({
        incidentId: id("Incident"),
        status: z.enum(INCIDENT_STATUSES),
        body: z.string().trim().min(1).max(20_000).describe("Public update, plain language"),
        notify: notifyField,
      }),
      run: async (principal, { incidentId, ...update }) => {
        const pageId = await deps.incidentPageId(principal.orgId, incidentId);
        if (!pageId || !pageAllowed(principal, pageId)) throw new McpToolError("Incident not found");
        const created = await domainCall(() => deps.addIncidentUpdate(principal.orgId, incidentId, update));
        await deps.audit(principal, "MCP_UPDATE_INCIDENT", incidentId);
        return { id: created.id, notified: update.notify };
      },
    }),
  ];
}

/** Tools the key may use. Hidden tools are not registered, so calling them fails like an unknown tool. */
export function visibleTools(tools: ToolDefinition[], principal: McpPrincipal) {
  return tools.filter((candidate) => principal.scopes.includes(candidate.scope));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/mcp-tools.test.ts && npx tsc --noEmit`
Expected: PASS (14 tests), no type errors. If `z.ZodObject` without type arguments is rejected by this zod version, use `z.ZodObject<z.ZodRawShape>`; both appear in zod 4.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools.ts tests/mcp-tools.test.ts
git commit -m "feat: MCP tool registry with scope and page enforcement"
```

---

### Task 3: Server assembly, tested through the real SDK

**Files:**
- Create: `lib/mcp/server.ts`
- Test: `tests/mcp-server.test.ts`

**Interfaces:**
- Consumes: `createTools`, `visibleTools`, `McpToolError`, `McpPrincipal`, `ToolDefinition`, `ToolDeps` (Task 2); `McpServer` from `@modelcontextprotocol/server`.
- Produces: `buildMcpServer(principal: McpPrincipal, tools: ToolDefinition[], onUnexpected?: (error: unknown) => void): McpServer`

The test drives the real SDK handler (`createMcpHandler(...).fetch(Request)`) with fake `ToolDeps`, so protocol behavior (listing, validation, unknown tools, error shape) is verified without a database.

- [ ] **Step 1: Write the failing tests**

`tests/mcp-server.test.ts`:

```ts
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { buildMcpServer } from "../lib/mcp/server";
import { createTools, type McpPrincipal, type ToolDeps } from "../lib/mcp/tools";

const PAGE = "11111111-1111-4111-8111-111111111111";
const COMPONENT = "33333333-3333-4333-8333-333333333333";

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

const principal = (scopes: string[]): McpPrincipal => ({ orgId: "org-1", apiKeyId: "key-1", scopes, pageIds: null });

function deps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    listComponents: async () => ({ pages: [{ id: PAGE, name: "Main", components: [] }] }),
    listIncidents: async () => ({ incidents: [] }),
    incidentPageId: async () => PAGE,
    createIncident: async () => ({ id: "incident-1" }),
    addIncidentUpdate: async () => ({ id: "update-1" }),
    audit: async () => undefined,
    ...overrides,
  };
}

async function rpc(who: McpPrincipal, toolDeps: ToolDeps, method: string, params: Record<string, unknown> = {}, onUnexpected = vi.fn()) {
  const handler = createMcpHandler(() => buildMcpServer(who, createTools(toolDeps), onUnexpected));
  const name: Record<string, string> = typeof params.name === "string" ? { "mcp-name": params.name } : {};
  const response = await handler.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
        ...name,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: meta } }),
    })
  );
  const body = JSON.parse(await response.text());
  await handler.close();
  return body;
}

describe("tools/list", () => {
  it("lists only what the key's scopes allow", async () => {
    const reader = await rpc(principal(["components.read", "incidents.read"]), deps(), "tools/list");
    expect(reader.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["list_components", "list_incidents"]);
    expect(reader.result.tools[0].annotations).toMatchObject({ readOnlyHint: true });

    const writer = await rpc(principal(["incidents.write"]), deps(), "tools/list");
    expect(writer.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["create_incident", "post_incident_update"]);
    expect(writer.result.tools[0].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("has no tools to list for a key without any tool scope", async () => {
    // The route answers such keys with a clear 403 before this point; the SDK itself reports the method as missing.
    expect((await rpc(principal(["metrics.write"]), deps(), "tools/list")).error.code).toBe(-32601);
  });
});

describe("tools/call", () => {
  it("runs a permitted tool and returns JSON text", async () => {
    const body = await rpc(principal(["components.read"]), deps(), "tools/call", { name: "list_components", arguments: {} });
    expect(body.result.isError).toBeUndefined();
    expect(JSON.parse(body.result.content[0].text).pages[0].name).toBe("Main");
  });

  it("fails like an unknown tool when the key lacks the scope", async () => {
    const body = await rpc(principal(["components.read"]), deps(), "tools/call", {
      name: "create_incident",
      arguments: { pageId: PAGE, name: "Down", impact: "MAJOR", body: "Investigating.", components: [{ componentId: COMPONENT, status: "MAJOR_OUTAGE" }] },
    });
    expect(body.error.message).toContain("not found");
  });

  it("creates an incident without notifying by default", async () => {
    const createIncident = vi.fn(async () => ({ id: "incident-1" }));
    const body = await rpc(principal(["incidents.write"]), deps({ createIncident }), "tools/call", {
      name: "create_incident",
      arguments: { pageId: PAGE, name: "Down", impact: "MAJOR", body: "Investigating.", components: [{ componentId: COMPONENT, status: "MAJOR_OUTAGE" }] },
    });
    expect(JSON.parse(body.result.content[0].text)).toEqual({ id: "incident-1", notified: false });
    expect(createIncident).toHaveBeenCalledWith("org-1", expect.objectContaining({ notify: false }));
  });

  it("returns invalid arguments as a tool error the model can correct", async () => {
    const body = await rpc(principal(["incidents.write"]), deps(), "tools/call", {
      name: "create_incident",
      arguments: { pageId: "not-a-uuid", name: "Down", impact: "HUGE", body: "x" },
    });
    expect(body.result.isError).toBe(true);
  });

  it("shows safe domain messages to the model", async () => {
    const body = await rpc(
      principal(["incidents.write"]),
      deps({ createIncident: async () => { throw new Error("Page not found"); } }),
      "tools/call",
      { name: "create_incident", arguments: { pageId: PAGE, name: "Down", impact: "MAJOR", body: "x", pageWide: true } }
    );
    expect(body.result).toMatchObject({ isError: true, content: [{ type: "text", text: "Page not found" }] });
  });

  it("hides unexpected error text from the client and reports it to the server log", async () => {
    const onUnexpected = vi.fn();
    const body = await rpc(
      principal(["incidents.read"]),
      deps({ listIncidents: async () => { throw new Error("connect ECONNREFUSED 10.0.4.12:5432"); } }),
      "tools/call",
      { name: "list_incidents", arguments: {} },
      onUnexpected
    );
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("10.0.4.12");
    expect(body.result.content[0].text).toBe("The request could not be completed.");
    expect(onUnexpected).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/mcp-server.test.ts`
Expected: FAIL, "Failed to resolve import ../lib/mcp/server".

- [ ] **Step 3: Implement**

`lib/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { McpToolError, visibleTools, type McpPrincipal, type ToolDefinition } from "@/lib/mcp/tools";

const text = (value: string) => [{ type: "text" as const, text: value }];

/** One MCP server per request, exposing only the tools this API key may use. */
export function buildMcpServer(
  principal: McpPrincipal,
  tools: ToolDefinition[],
  onUnexpected: (error: unknown) => void = () => undefined
) {
  const server = new McpServer({ name: "signalhub", version: "1.0.0" });
  for (const definition of visibleTools(tools, principal)) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: { readOnlyHint: definition.readOnly, destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown) => {
        try {
          return { content: text(JSON.stringify(await definition.run(principal, args), null, 2)) };
        } catch (error) {
          if (error instanceof McpToolError) return { content: text(error.message), isError: true };
          onUnexpected(error);
          return { content: text("The request could not be completed."), isError: true };
        }
      }
    );
  }
  return server;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/mcp-server.test.ts && npx tsc --noEmit`
Expected: PASS (8 tests), no type errors. If `tsc` rejects the `registerTool` callback's parameter type, type it from the schema instead of `unknown`: `async (args) => ...` is inferred from `inputSchema` by the SDK, and `definition.run` accepts `unknown`, so either form works.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/server.ts tests/mcp-server.test.ts
git commit -m "feat: assemble the MCP server from scope-filtered tools"
```

---

### Task 4: Database wiring, route, docs, manual check

**Files:**
- Create: `lib/mcp/deps.ts`
- Create: `app/api/mcp/route.ts`
- Modify: `lib/help-content.ts` (add a section to the `api-quickstart` article)

**Interfaces:**
- Consumes: Task 1-3 modules; `authenticateApiKey` (`lib/api-auth.ts`), `consumeRateLimit`, `RateLimitError` (`lib/rate-limit.ts`), `apiError`, `routeError` (`lib/api-response.ts`), `createIncident`, `addIncidentUpdate` (`lib/domain/incidents.ts`), `writeActiveTenantAudit` (`lib/tenant-audit.ts`), `logger`, `errorFields` (`lib/logger.ts`), `database`.
- Produces: `mcpToolDeps: ToolDeps`; `POST /api/mcp`; `GET`/`DELETE /api/mcp` answer 405.

This task is thin wiring over tested pieces; it is verified by typecheck, build, and the manual check.

- [ ] **Step 1: Read the route handler guide**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Existing routes (for example `app/api/v1/manage/incidents/route.ts`) are the pattern to follow.

- [ ] **Step 2: Write the database wiring**

`lib/mcp/deps.ts`:

```ts
import { addIncidentUpdate, createIncident } from "@/lib/domain/incidents";
import { errorFields, logger } from "@/lib/logger";
import { database } from "@/lib/postgres/client";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";
import type { ToolDeps } from "@/lib/mcp/tools";

const RECENT_INCIDENTS = 20;
const UPDATES_PER_INCIDENT = 3;

function scopedPages(orgId: string, pageIds: readonly string[] | null, pageId?: string) {
  let query = database.selectFrom("pages").select(["id", "name", "slug"]).where("orgId", "=", orgId).where("deletedAt", "is", null);
  if (pageIds) query = query.where("id", "in", [...pageIds]);
  if (pageId) query = query.where("id", "=", pageId);
  return query.orderBy("createdAt", "asc").execute();
}

export const mcpToolDeps: ToolDeps = {
  async listComponents(orgId, pageIds, pageId) {
    const pages = await scopedPages(orgId, pageIds, pageId);
    if (!pages.length) return { pages: [] };
    const components = await database.selectFrom("components").select(["id", "pageId", "name", "status"])
      .where("pageId", "in", pages.map((page) => page.id)).orderBy("order").execute();
    return {
      pages: pages.map((page) => ({
        ...page,
        components: components.filter((component) => component.pageId === page.id).map(({ pageId: _pageId, ...rest }) => rest),
      })),
    };
  },

  async listIncidents(orgId, pageIds, { pageId, openOnly }) {
    const pages = await scopedPages(orgId, pageIds, pageId);
    if (!pages.length) return { incidents: [] };
    let query = database.selectFrom("incidents")
      .select(["id", "pageId", "name", "status", "impact", "pageWide", "createdAt", "resolvedAt"])
      .where("pageId", "in", pages.map((page) => page.id)).where("isMaintenance", "=", false);
    if (openOnly) query = query.where("status", "!=", "RESOLVED");
    const incidents = await query.orderBy("createdAt", "desc").limit(RECENT_INCIDENTS).execute();
    if (!incidents.length) return { incidents: [] };
    const ids = incidents.map((incident) => incident.id);
    const [updates, links] = await Promise.all([
      database.selectFrom("incidentUpdates").select(["incidentId", "status", "body", "createdAt"])
        .where("incidentId", "in", ids).orderBy("createdAt", "asc").execute(),
      database.selectFrom("incidentComponents").select(["incidentId", "componentId", "newStatus"])
        .where("incidentId", "in", ids).execute(),
    ]);
    return {
      incidents: incidents.map((incident) => ({
        ...incident,
        updates: updates.filter((update) => update.incidentId === incident.id).slice(-UPDATES_PER_INCIDENT)
          .map(({ incidentId: _incidentId, ...rest }) => rest),
        components: links.filter((link) => link.incidentId === incident.id).map(({ incidentId: _incidentId, ...rest }) => rest),
      })),
    };
  },

  async incidentPageId(orgId, incidentId) {
    const row = await database.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select("page.id as pageId")
      .where("incident.id", "=", incidentId).where("page.orgId", "=", orgId).where("page.deletedAt", "is", null)
      .executeTakeFirst();
    return row?.pageId ?? null;
  },

  createIncident: (orgId, input) => createIncident(orgId, input),

  addIncidentUpdate: (orgId, incidentId, input) => addIncidentUpdate(orgId, incidentId, input),

  // ponytail: audit is written after the write, best effort. Strict "no write without audit" would need the audit insert inside the domain transaction.
  async audit(principal, action, target) {
    try {
      await writeActiveTenantAudit(principal.orgId, { actor: `api-key:${principal.apiKeyId}`, action, target });
    } catch (error) {
      logger.error({ ...errorFields(error), action, target }, "MCP audit entry could not be written");
    }
  },
};
```

- [ ] **Step 3: Write the route**

`app/api/mcp/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { apiError, routeError } from "@/lib/api-response";
import { errorFields, logger } from "@/lib/logger";
import { mcpToolDeps } from "@/lib/mcp/deps";
import { originAllowed } from "@/lib/mcp/origin";
import { buildMcpServer } from "@/lib/mcp/server";
import { createTools, visibleTools, type McpPrincipal } from "@/lib/mcp/tools";
import { consumeRateLimit, RateLimitError } from "@/lib/rate-limit";

const tools = createTools(mcpToolDeps);

// The principal travels in authInfo.extra: the SDK builds a fresh server per request and never reads credentials itself.
const handler = createMcpHandler(({ authInfo }) => {
  const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
  if (!principal) throw new Error("MCP request reached the handler without an authenticated principal");
  return buildMcpServer(principal, tools, (error) => logger.error(errorFields(error), "MCP tool failed"));
});

export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request.headers.get("origin"), process.env.NEXT_PUBLIC_APP_URL)) {
      return apiError(403, "ORIGIN_FORBIDDEN", "This origin may not call the MCP endpoint");
    }
    const apiKey = await authenticateApiKey(request);
    if (!apiKey) {
      const response = apiError(401, "UNAUTHENTICATED", "A valid API key is required");
      response.headers.set("www-authenticate", "Bearer");
      return response;
    }
    await consumeRateLimit("mcp", apiKey.id, { limit: 120, windowMs: 60_000 });
    const principal: McpPrincipal = { orgId: apiKey.orgId, apiKeyId: apiKey.id, scopes: apiKey.scopes, pageIds: apiKey.pageIds };
    if (!visibleTools(tools, principal).length) {
      return apiError(403, "INSUFFICIENT_SCOPE", "This API key has no scope the MCP tools use: components.read, incidents.read or incidents.write");
    }
    return await handler.fetch(request, {
      authInfo: { token: "api-key", clientId: apiKey.id, scopes: [...apiKey.scopes], extra: { principal } },
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many MCP requests");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "POST /api/mcp" });
  }
}

// MCP revision 2026-07-28 has no GET stream and no sessions; older clients get 405 and fall back to POST.
const methodNotAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } });
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
```

- [ ] **Step 4: Document it in the help center**

In `lib/help-content.ts`, inside the `api-quickstart` article's `body` array (after the "Endpoints" section), add:

```ts
          {
            heading: "Use SignalHub from an AI client (MCP)",
            paragraphs: [
              "SignalHub speaks the Model Context Protocol at POST /api/mcp, so an AI client such as Claude can list components and incidents and, with write scopes, open incidents and post updates. Use an API key with only the scopes you want the client to have: components.read and incidents.read for read-only access; add incidents.write to allow changes. Page restrictions on the key apply.",
              "Write tools do not notify subscribers unless the client sets notify to true. Every change is recorded in the audit log under the key.",
            ],
            code: "claude mcp add --transport http signalhub https://status.example.com/api/mcp \\\n  --header \"Authorization: Bearer $SIGNALHUB_API_KEY\"",
          },
```

Run `npx vitest run tests/help-content.test.ts` afterwards; it checks route uniqueness and coverage terms and must still pass.

- [ ] **Step 5: Typecheck, lint, tests, build**

Run: `npx tsc --noEmit && npx eslint lib/mcp app/api/mcp lib/help-content.ts --max-warnings=0 && npm test && npm run build:web`
Expected: all pass and the build compiles the new route. If the webpack build cannot bundle the SDK (ESM-only package), add it to `serverExternalPackages` in `next.config.ts`; read `node_modules/next/dist/docs` for that option's current name before editing.

- [ ] **Step 6: Manual check against a running instance**

Run `npm run dev:all`. In the admin UI create two API keys: one with `components.read incidents.read`, one with `incidents.write`. Then:

```bash
KEY=<read-key>; URL=http://localhost:3301/api/mcp
# Current protocol revision (2026-07-28 envelope)
curl -s "$URL" -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H 'mcp-protocol-version: 2026-07-28' -H 'mcp-method: tools/list' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
# Older clients (2025-11-25 handshake)
curl -s "$URL" -H "authorization: Bearer $KEY" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Expected:
1. The read key lists `list_components` and `list_incidents` only; the write key lists the two write tools.
2. No `Authorization` header returns 401 with `www-authenticate: Bearer`; a key with none of `components.read`, `incidents.read`, `incidents.write` returns 403 `INSUFFICIENT_SCOPE`. `-H 'origin: https://evil.example.net'` returns 403. `curl -X GET "$URL" -H "authorization: Bearer $KEY"` returns 405.
3. With the write key, call `create_incident` (use real page and component ids from `list_components` with a read key). Expected: the incident exists in the admin UI, subscribers were not notified, and the audit log has `MCP_CREATE_INCIDENT` by `api-key:<id>`.
4. A key restricted to one page cannot read or write another page (404-style "Page not found").
5. In Claude Code run the `claude mcp add` command from the help article against the dev server and ask it to "list open incidents".

- [ ] **Step 7: Final verification and commit**

Run: `npm run verify`
Expected: lint (zero warnings), typecheck, tests, build all pass.

```bash
git add lib/mcp app/api/mcp lib/help-content.ts
git commit -m "feat: MCP endpoint backed by scoped API keys"
```

---

## Self-review notes

- Spec coverage (D1): MCP over the existing API with scoped keys (Tasks 2-4), read-only default via scopes (3), writes audited (4), no LLM inside SignalHub (architecture), conservative notify default (2).
- Not built: resources/prompts, component status changes, metrics tools, monitor tools. Add as further `ToolDefinition`s in `createTools`; each needs one scope and one test.
- Known limit: audit is best effort after the write (see `ponytail` comment in `lib/mcp/deps.ts`). The REST routes have no audit today, so this is still an improvement; tighten if compliance requires it.
- Security note for the owner: any key given `incidents.write` lets an AI client publish public incident text. Create dedicated keys for AI clients and keep `notify` off by default (already the default here).
