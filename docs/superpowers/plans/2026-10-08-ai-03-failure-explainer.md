# Plain-Language Monitor Failure Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an operator opens a failed monitor check, SignalHub says in plain words what the failure means and what to check first. A rule-based explanation works with AI off; an optional "Explain with AI" button handles anything the rules do not recognise.

**Architecture:** Tasks 1-2 add a pure rule table (`explainFailure`) next to the existing `classifyFailure` in `lib/failure-kind.ts` and show it in the check detail dialog. Task 3 adds an on-demand AI explanation: a pure prompt builder, a server action, and a button in the same dialog, shown only to users who can manage monitors in an organization with AI on.

**Tech Stack:** TypeScript, React client components, Next.js server actions, Vitest.

**Spec:** `AI-FEATURE-IDEAS.txt` (B1 Plain-language failure explanation). **Depends on:** Tasks 1-2 nothing; Task 3 needs `docs/superpowers/plans/2026-10-08-ai-01-gateway.md` implemented.

## Global Constraints

- The explanation is shown only in the admin UI, never on public pages or in notifications (raw errors stay internal; public text already uses `publicFailureMessage`).
- Rule text is hedged ("likely", "check"), never an instruction to change production.
- The AI prompt contains: monitor type, HTTP status, latency, the rule-based reading, and the check error (redacted and wrapped as untrusted). It never contains the monitor target, headers, body, or credentials.
- The AI explanation needs `monitor.manage` (Admin or Responder), the same page-scope check as the rest of the monitors UI (`assertPageInOrg`).
- Text style matches the existing admin UI; no new UI primitives.

## Review Focus

1. A failed check whose error matches no rule (or is null) must still render something sensible (Task 1 test, "not recognise").
2. HTTP failures where `statusCode` is set must not be explained as network failures, and keyword failures with status 200 must not be explained as "the service is up" (Task 1 rule order and tests).
3. The check error contains an internal address, token or email: it must be redacted before leaving for the provider (Task 3 test).
4. A user outside the monitor's page scope, or from another organization, asks for an explanation of someone else's check (Task 3 action: `assertPageInOrg` first).
5. AI unavailable or failing: the dialog keeps showing the rule-based explanation and a short inline note (Task 3 manual check).

---

### Task 1: Rule-based explanation

**Files:**
- Modify: `lib/failure-kind.ts` (add `explainFailure` after `publicFailureMessage`)
- Test: `tests/failure-explain.test.ts`

**Interfaces:**
- Consumes: `classifyFailure` (same file).
- Produces: `explainFailure(check: { error: string | null; statusCode: number | null }): { meaning: string; firstCheck: string }`

- [ ] **Step 1: Write the failing tests**

`tests/failure-explain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { explainFailure } from "../lib/failure-kind";

describe("explainFailure", () => {
  it.each([
    [{ error: "Required keyword was not found", statusCode: 200 }, "expected text was missing"],
    [{ error: "Forbidden keyword was found", statusCode: 200 }, "text that should never appear"],
    [{ error: "No heartbeat received", statusCode: null }, "did not check in"],
    [{ error: "Heartbeat is 412 seconds old", statusCode: null }, "did not check in"],
    [{ error: "Expected 200-299, received 502", statusCode: 502 }, "server error"],
    [{ error: "Expected 200-299, received 401", statusCode: 401 }, "rejected the monitor's credentials"],
    [{ error: "Expected 200-299, received 403", statusCode: 403 }, "rejected the monitor's credentials"],
    [{ error: "Expected 200-299, received 404", statusCode: 404 }, "path was not found"],
    [{ error: "Expected 200-299, received 429", statusCode: 429 }, "rate limiting"],
    [{ error: "Expected 200-299, received 418", statusCode: 418 }, "client error"],
    [{ error: "Too many or invalid redirects", statusCode: null }, "redirects"],
    [{ error: "getaddrinfo ENOTFOUND shop.example.com", statusCode: null }, "could not be resolved"],
    [{ error: "connect ECONNREFUSED 10.0.0.1:443", statusCode: null }, "refused or dropped"],
    [{ error: "certificate has expired", statusCode: null }, "secure connection"],
    [{ error: "The operation was aborted due to timeout", statusCode: null }, "did not answer"],
    [{ error: "something odd happened", statusCode: null }, "not recognise"],
    [{ error: null, statusCode: null }, "not recognise"],
  ])("%j", (check, fragment) => {
    expect(explainFailure(check).meaning).toContain(fragment);
  });

  it("always gives a first thing to check", () => {
    expect(explainFailure({ error: "connect ECONNREFUSED 10.0.0.1:443", statusCode: null }).firstCheck).toContain("listening");
    expect(explainFailure({ error: null, statusCode: null }).firstCheck.length).toBeGreaterThan(0);
  });

  it("explains a status code even when the error text is empty", () => {
    expect(explainFailure({ error: null, statusCode: 503 }).meaning).toContain("server error");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/failure-explain.test.ts`
Expected: FAIL, `explainFailure is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/failure-kind.ts`:

```ts
type Explanation = { meaning: string; firstCheck: string };

/** First match wins, so the specific rules come before the broad network categories. */
const EXPLANATION_RULES: { applies: (check: { error: string | null; statusCode: number | null }) => boolean; explanation: Explanation }[] = [
  {
    applies: ({ error }) => /required keyword was not found/i.test(error ?? ""),
    explanation: {
      meaning: "The page loaded but the expected text was missing.",
      firstCheck: "Open the page and confirm the text is still there; it may be showing an error or a login screen.",
    },
  },
  {
    applies: ({ error }) => /forbidden keyword was found/i.test(error ?? ""),
    explanation: {
      meaning: "The page loaded but contains text that should never appear.",
      firstCheck: "Open the page and look for an error message or a maintenance banner.",
    },
  },
  {
    applies: ({ error }) => /heartbeat/i.test(error ?? ""),
    explanation: {
      meaning: "The scheduled job did not check in on time.",
      firstCheck: "Check that the job ran (scheduler or cron logs) and can still reach SignalHub.",
    },
  },
  {
    applies: ({ statusCode }) => statusCode !== null && statusCode >= 500,
    explanation: {
      meaning: "The service answered with a server error.",
      firstCheck: "Check the service's application logs and any recent deploy.",
    },
  },
  {
    applies: ({ statusCode }) => statusCode === 401 || statusCode === 403,
    explanation: {
      meaning: "The service rejected the monitor's credentials.",
      firstCheck: "Check the monitor's authentication settings and whether the credential has expired.",
    },
  },
  {
    applies: ({ statusCode }) => statusCode === 404,
    explanation: {
      meaning: "The address answered but the path was not found.",
      firstCheck: "Check the monitor's URL path and any recent routing change.",
    },
  },
  {
    applies: ({ statusCode }) => statusCode === 429,
    explanation: {
      meaning: "The service is rate limiting the monitor.",
      firstCheck: "Raise the check interval or allow-list the monitor.",
    },
  },
  {
    applies: ({ statusCode }) => statusCode !== null && statusCode >= 400,
    explanation: {
      meaning: "The service answered with a client error.",
      firstCheck: "Compare the status with the expected status range in the monitor settings.",
    },
  },
  {
    applies: ({ error }) => /redirect/i.test(error ?? ""),
    explanation: {
      meaning: "The address redirects in a loop or to an invalid location.",
      firstCheck: "Open the URL in a browser, follow the redirects, and point the monitor at the final address.",
    },
  },
  {
    applies: ({ error }) => classifyFailure(error) === "dns",
    explanation: {
      meaning: "The hostname could not be resolved to an address.",
      firstCheck: "Check that the DNS record exists and has not expired, and that the monitor target is spelled correctly.",
    },
  },
  {
    applies: ({ error }) => classifyFailure(error) === "tls",
    explanation: {
      meaning: "The secure connection could not be established or the certificate was rejected.",
      firstCheck: "Check certificate expiry, the full certificate chain, and that the hostname matches the certificate.",
    },
  },
  {
    applies: ({ error }) => classifyFailure(error) === "refused",
    explanation: {
      meaning: "The server refused or dropped the connection.",
      firstCheck: "Check that the service is running and listening on that port, and that no firewall rule drops the traffic.",
    },
  },
  {
    applies: ({ error }) => classifyFailure(error) === "timeout",
    explanation: {
      meaning: "The service did not answer within the monitor's timeout.",
      firstCheck: "Check whether the service is overloaded or blocked by a firewall, and whether the timeout is too short for this endpoint.",
    },
  },
];

const UNRECOGNISED: Explanation = {
  meaning: "The check failed for a reason SignalHub does not recognise.",
  firstCheck: "Read the error message and check the service's own logs.",
};

/** Admin-facing reading of a failed check. Never shown publicly; the raw error stays visible beside it. */
export function explainFailure(check: { error: string | null; statusCode: number | null }): Explanation {
  return EXPLANATION_RULES.find((rule) => rule.applies(check))?.explanation ?? UNRECOGNISED;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/failure-explain.test.ts tests/failure-kind.test.ts`
Expected: PASS (new tests plus the existing `failure-kind` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/failure-kind.ts tests/failure-explain.test.ts
git commit -m "feat: rule-based plain-language explanation for failed monitor checks"
```

---

### Task 2: Show the explanation in the check detail dialog

**Files:**
- Modify: `components/admin/MonitorDrawer.tsx` (`CheckDetail`, around lines 88-110)

**Interfaces:**
- Consumes: `explainFailure` (Task 1); `MonitorCheck` already has `ok`, `statusCode`, `error`.

- [ ] **Step 1: Add the rows**

In `components/admin/MonitorDrawer.tsx` add the import with the other `@/lib` imports:

```tsx
import { explainFailure } from "@/lib/failure-kind";
```

In `CheckDetail`, compute the explanation and extend the rows array. Replace the `const rows = ([ ... ])` block with:

```tsx
  const explanation = check.ok ? null : explainFailure(check);
  const rows = ([
    ["Checked", new Date(check.checkedAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" })],
    ["Latency", check.latencyMs === null ? null : `${check.latencyMs} ms`],
    ["HTTP status", check.statusCode],
    ["Error", check.error],
    ["What this means", explanation?.meaning ?? null],
    ["Check first", explanation?.firstCheck ?? null],
    ["Check ID", check.id],
  ] as [string, string | number | null][]).filter(([, value]) => value !== null && value !== "");
```

- [ ] **Step 2: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npx eslint components/admin/MonitorDrawer.tsx --max-warnings=0 && npm test`
Expected: pass.

- [ ] **Step 3: Manual check**

Run `npm run dev:all`, open Monitors, open the history of a monitor that has failed checks (create an HTTP monitor to `http://localhost:9` to force `ECONNREFUSED`, run it, wait for a check), click a failed row. Expected: rows "What this means" and "Check first" appear under Error. An up check shows neither row.

- [ ] **Step 4: Commit**

```bash
git add components/admin/MonitorDrawer.tsx
git commit -m "feat: explain failed checks in the monitor check detail dialog"
```

---

### Task 3: Optional AI explanation (needs the AI gateway plan)

**Files:**
- Create: `lib/ai/failure-explain.ts`
- Test: `tests/ai-failure-explain.test.ts`
- Modify: `app/admin/(protected)/monitors/actions.ts` (add `explainCheckFailure`)
- Modify: `components/admin/MonitorDrawer.tsx` (button in `CheckDetail`, prop chain to `CheckHistory` and `MonitorHistoryDrawer`)
- Modify: `components/admin/MonitorList.tsx` (prop chain)
- Modify: `app/admin/(protected)/monitors/page.tsx` (compute availability)

**Interfaces:**
- Consumes: `untrusted`, `UNTRUSTED_RULE` (`lib/ai/redact.ts`); `explainFailure` (Task 1); `complete`, `aiAvailableForOrg`, `AiUnavailableError`, `AiProviderError` (`lib/ai`).
- Produces:
  - `type FailureExplainContext = { monitorType: string; statusCode: number | null; latencyMs: number | null; error: string | null; ruleBasedMeaning: string }`
  - `buildFailureExplainPrompt(context: FailureExplainContext): { system: string; input: string }`
  - `type ExplainResult = { ok: true; text: string } | { ok: false; error: string }`
  - `explainCheckFailure(monitorId: string, checkId: string, checkedAt: string): Promise<ExplainResult>`

- [ ] **Step 1: Write the failing prompt tests**

`tests/ai-failure-explain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFailureExplainPrompt } from "../lib/ai/failure-explain";
import { UNTRUSTED_RULE } from "../lib/ai/redact";

const context = {
  monitorType: "HTTP",
  statusCode: 502,
  latencyMs: 10_000,
  error: "Expected 200-299, received 502",
  ruleBasedMeaning: "The service answered with a server error.",
};

describe("buildFailureExplainPrompt", () => {
  it("passes the facts the model may use", () => {
    const { input } = buildFailureExplainPrompt(context);
    expect(input).toContain("Monitor type: HTTP");
    expect(input).toContain("HTTP status: 502");
    expect(input).toContain("Response time: 10000 ms");
    expect(input).toContain("Rule-based reading: The service answered with a server error.");
    expect(input).toContain("Expected 200-299, received 502");
  });

  it("says none when there is no status, latency or error", () => {
    const { input } = buildFailureExplainPrompt({ ...context, statusCode: null, latencyMs: null, error: null });
    expect(input).toContain("HTTP status: none");
    expect(input).toContain("Response time: none");
    expect(input).toContain('<untrusted label="check error">\nnone\n</untrusted>');
  });

  it("redacts addresses and tokens in the error and wraps it as untrusted", () => {
    const { input } = buildFailureExplainPrompt({
      ...context,
      error: "connect ECONNREFUSED 10.0.4.12:5432 for ops@acme.io Bearer abcdef123456",
    });
    expect(input).not.toContain("10.0.4.12");
    expect(input).not.toContain("ops@acme.io");
    expect(input).not.toContain("abcdef123456");
    expect(input).toContain('<untrusted label="check error">');
  });

  it("asks for hedged causes and forbids inventing facts or changing systems", () => {
    const { system } = buildFailureExplainPrompt(context);
    expect(system).toContain("likely, not certain");
    expect(system).toContain("Do not invent facts");
    expect(system).toContain("Do not suggest changing production systems");
    expect(system).toContain(UNTRUSTED_RULE);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ai-failure-explain.test.ts`
Expected: FAIL, "Failed to resolve import ../lib/ai/failure-explain".

- [ ] **Step 3: Implement the prompt builder**

`lib/ai/failure-explain.ts`:

```ts
import { UNTRUSTED_RULE, untrusted } from "@/lib/ai/redact";

export type FailureExplainContext = {
  monitorType: string;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  ruleBasedMeaning: string;
};

const SYSTEM = [
  "You help an on-call engineer understand why an automated uptime check failed.",
  "In at most four sentences give the most likely cause and the two most useful things to check first.",
  "Present causes as likely, not certain. Do not invent facts about the service.",
  "Do not suggest changing production systems.",
  UNTRUSTED_RULE,
].join(" ");

export function buildFailureExplainPrompt(context: FailureExplainContext) {
  const input = [
    `Monitor type: ${context.monitorType}`,
    `HTTP status: ${context.statusCode ?? "none"}`,
    `Response time: ${context.latencyMs === null ? "none" : `${context.latencyMs} ms`}`,
    `Rule-based reading: ${context.ruleBasedMeaning}`,
    untrusted("check error", context.error ?? "none"),
    "Explain the likely cause and what to check first.",
  ].join("\n");
  return { system: SYSTEM, input };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/ai-failure-explain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the server action**

In `app/admin/(protected)/monitors/actions.ts` add imports:

```ts
import { AiProviderError, AiUnavailableError, complete } from "@/lib/ai";
import { buildFailureExplainPrompt } from "@/lib/ai/failure-explain";
import { isDatabaseId } from "@/lib/database-id";
import { explainFailure } from "@/lib/failure-kind";
```

and append:

```ts
export type ExplainResult = { ok: true; text: string } | { ok: false; error: string };

/** Asks the model to explain one failed check. Read-only; the rule-based reading stays visible either way. */
export async function explainCheckFailure(monitorId: string, checkId: string, checkedAt: string): Promise<ExplainResult> {
  const session = await requireCapability("monitor.manage");
  const when = new Date(checkedAt);
  if (!isDatabaseId(monitorId) || !isDatabaseId(checkId) || Number.isNaN(when.getTime())) {
    return { ok: false, error: "Check not found" };
  }
  const monitor = await database.selectFrom("monitors").select(["id", "pageId", "type"])
    .where("id", "=", monitorId).executeTakeFirst();
  if (!monitor) return { ok: false, error: "Check not found" };
  await assertPageInOrg(monitor.pageId, session.orgId);
  // checked_at is part of the partitioned primary key; matching it lets Postgres read one partition.
  const check = await database.selectFrom("monitorChecks").select(["ok", "statusCode", "latencyMs", "error"])
    .where("id", "=", checkId).where("monitorId", "=", monitor.id).where("checkedAt", "=", when).executeTakeFirst();
  if (!check || check.ok) return { ok: false, error: "Check not found" };

  const prompt = buildFailureExplainPrompt({
    monitorType: monitor.type,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    error: check.error,
    ruleBasedMeaning: explainFailure(check).meaning,
  });
  try {
    const { text } = await complete({ feature: "failure-explain", orgId: session.orgId, system: prompt.system, input: prompt.input, maxTokens: 300 });
    return { ok: true, text };
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof AiProviderError) return { ok: false, error: error.message };
    throw error;
  }
}
```

- [ ] **Step 6: Add the button and the prop chain**

`components/admin/MonitorDrawer.tsx`:
1. Change the React import to include `useTransition`, and add `import { explainCheckFailure } from "@/app/admin/(protected)/monitors/actions";` and `import { Sparkles } from "lucide-react";` (extend the existing lucide import).
2. Replace the `CheckDetail` signature and add state, then render the button and result below the `<dl>`:

```tsx
function CheckDetail({ name, check, monitorId, aiExplain, onClose }: { name: string; check: MonitorCheck; monitorId: string; aiExplain: boolean; onClose: () => void }) {
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  function ask() {
    setAiError(null);
    startAsking(async () => {
      const result = await explainCheckFailure(monitorId, check.id, check.checkedAt);
      if (result.ok) setAiText(result.text);
      else setAiError(result.error);
    });
  }
  // ...existing explanation and rows code from Task 2 stays unchanged...
```

and after the `</dl>` element, before `<DialogActions>`:

```tsx
        {aiExplain && !check.ok && (
          <div className="mt-4 space-y-2">
            <Button type="button" variant="secondary" size="sm" onClick={ask} loading={asking} disabled={asking}>
              <Sparkles aria-hidden size={14} />{asking ? "Thinking…" : "Explain with AI"}
            </Button>
            {aiError && <p role="alert" className="text-xs leading-5 text-danger-fg">{aiError}</p>}
            {aiText && (
              <div role="status" className="space-y-1 rounded-control bg-sunken p-3">
                <p className="whitespace-pre-wrap text-sm text-ink">{aiText}</p>
                <p className="text-xs text-ink-dim">AI suggestion. Treat it as a hypothesis, not a diagnosis.</p>
              </div>
            )}
          </div>
        )}
```

3. `CheckHistory({ monitorId, name, firstPage })` -> add `aiExplain` to its props and render `<CheckDetail name={name} check={selected} monitorId={monitorId} aiExplain={aiExplain} onClose={() => setSelected(null)} />`.
4. `MonitorHistoryDrawer({ monitorId, name, latest })` -> add `aiExplain = false` prop (type `aiExplain?: boolean`) and pass `aiExplain={aiExplain}` to `<CheckHistory>`.

`components/admin/MonitorList.tsx`:
1. `MonitorRowView` (line 73) and `MonitorList` (line 137) signatures gain `aiExplain: boolean` / `aiExplain?: boolean` (default `false` on `MonitorList`).
2. Line 119: `<MonitorHistoryDrawer monitorId={m.id} name={m.name} latest={monitor.checks} aiExplain={aiExplain} />`.
3. Line 216: pass `aiExplain={aiExplain}` to `<MonitorRowView ... />`.

`app/admin/(protected)/monitors/page.tsx`: add `import { aiAvailableForOrg } from "@/lib/ai";` and change the list render to:

```tsx
        <MonitorList monitors={items} components={componentOptions} canManage={canManage} now={renderedAt} aiExplain={canManage && (await aiAvailableForOrg(org.id))} />
```

(`canManage` already exists on this page; it is true for `monitor.manage`.)

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npx eslint components/admin "app/admin/(protected)/monitors" lib/ai --max-warnings=0 && npm test`
Expected: pass. Other call sites of `CheckDetail`, `CheckHistory`, `MonitorHistoryDrawer` must still compile; if `tsc` names another caller, add the prop there.

- [ ] **Step 8: Manual check (needs the gateway plan Tasks 6 and 7 done)**

1. AI off for the organization: no "Explain with AI" button; the rule-based rows still show.
2. AI on: open a failed check; the button appears for an Admin or Responder and not for a Viewer. Click it. Expected: a short hedged explanation within a few seconds; the raw error and the rule-based rows remain.
3. Remove the key or set the cap to 1 and click again. Expected: a short inline error; the dialog still works.
4. `select feature, status from ai_usage order by created_at desc limit 3;` shows `failure-explain` rows.

- [ ] **Step 9: Final verification and commit**

Run: `npm run verify`
Expected: lint (zero warnings), typecheck, tests, build all pass.

```bash
git add lib/ai/failure-explain.ts tests/ai-failure-explain.test.ts "app/admin/(protected)/monitors" components/admin/MonitorDrawer.tsx components/admin/MonitorList.tsx
git commit -m "feat: optional AI explanation for failed monitor checks"
```

---

## Self-review notes

- Spec coverage (B1): rule-based mapping for the common cases that works without any LLM (Tasks 1-2), LLM only for unusual cases on demand (Task 3), shown beside the raw error (Task 2), hedged language and no production changes (Global Constraints, prompt).
- Public pages keep using `publicFailureMessage` (commit `abca579`); nothing here reaches subscribers.
