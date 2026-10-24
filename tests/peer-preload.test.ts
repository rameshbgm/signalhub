import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const preload = pathToFileURL(path.join(__dirname, "../scripts/peer-address.mjs")).href;

describe("peer-address preload", () => {
  it("stamps the real connection address over anything the client sent", () => {
    const script = `
      import http from "node:http";
      const server = http.createServer((request, response) => { response.end(request.headers["x-signalhub-peer"] ?? "none"); });
      server.listen(0, "127.0.0.1", async () => {
        const reply = await fetch("http://127.0.0.1:" + server.address().port, { headers: { "x-signalhub-peer": "6.6.6.6" } });
        console.log(await reply.text(), globalThis[Symbol.for("signalhub.peerHeader")]);
        server.close();
      });`;
    const output = execFileSync(process.execPath, ["--import", preload, "--input-type=module", "-e", script], { encoding: "utf8" });
    expect(output.trim()).toBe("127.0.0.1 true");
  });
});

describe("container image", () => {
  it("loads the preload for every entrypoint, not only the supervisor (Kubernetes runs `node server.js`)", () => {
    const dockerfile = readFileSync(path.join(__dirname, "../Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/NODE_OPTIONS=--import=\/app\/dist-runtime\/peer-address\.mjs/);
  });
});
