import { expect, it, vi } from "vitest";
import { boundedResponseText } from "@/lib/limited-response";

it("decodes valid multibyte provider responses split across chunks", async () => {
  const bytes = new TextEncoder().encode('{"ok":"✓"}');
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 8)); controller.enqueue(bytes.slice(8)); controller.close();
  } }));
  expect(await boundedResponseText(response, bytes.length)).toBe('{"ok":"✓"}');
});

it("cancels oversized upstream bodies with missing or false Content-Length", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6));
    }, cancel }), { headers });
    await expect(boundedResponseText(response, 10)).rejects.toThrow(/response limit/);
    expect(cancel).toHaveBeenCalledOnce();
  }
});

it("rejects a declared oversized upstream response before consuming its body", async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }), { headers: { "content-length": "1000" } });
  await expect(boundedResponseText(response, 10)).rejects.toThrow(/response limit/);
  expect(cancel).toHaveBeenCalledOnce();
});
