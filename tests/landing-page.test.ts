import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
  fileURLToPath(
    new URL("../components/landing/LandingPage.tsx", import.meta.url)
  ),
  "utf8"
);

const operationsPreviewSource = readFileSync(
  fileURLToPath(
    new URL("../components/landing/OperationsPreview.tsx", import.meta.url)
  ),
  "utf8"
);

describe("SignalHub landing page surface", () => {
  it("keeps the headline and canonical calls to action", () => {
    expect(landingSource).toContain("Stop renting your status page.");
    expect(landingSource).toContain(
      'const REPOSITORY_URL = "https://github.com/rameshbgm/signalhub"'
    );
    expect(landingSource).toContain(
      "https://github.com/rameshbgm/signalhub/blob/main/docs/OPEN_SOURCE_SETUP_GUIDE.md"
    );
    expect(landingSource).toContain("Get SignalHub on GitHub");
    expect(landingSource).toContain("Read the deployment guide");
  });

  it("retains navigation, sign-in, and every major section", () => {
    expect(landingSource).toContain('href="#why"');
    expect(landingSource).toContain('href="#capabilities"');
    expect(landingSource).toContain('href="#deploy"');
    expect(landingSource).toContain('href="/login"');
    expect(landingSource).not.toContain('console=organization');
    expect(landingSource).not.toContain('console=platform');
    expect(landingSource).not.toContain('href="/organization/login"');
    expect(landingSource).not.toContain('href="/platform/login"');
    expect(landingSource).toContain('id="why"');
    expect(landingSource).toContain('id="capabilities"');
    expect(landingSource).toContain('id="ownership-title"');
    expect(landingSource).toContain('id="deploy"');
    expect(landingSource).toContain("Available now on GitHub");
  });

  it("states the operating-cost caveat and external-link safety", () => {
    expect(landingSource).toContain(
      "Infrastructure costs still apply."
    );
    expect(landingSource).toContain('rel="noopener noreferrer"');
  });

  it("uses a recognizable live operations workspace in the hero", () => {
    expect(landingSource).toContain("OperationsPreview");
    expect(landingSource).not.toContain("SignalFlow");
    expect(landingSource).not.toContain("next/dynamic");
    expect(operationsPreviewSource).toContain("All systems operational");
    expect(operationsPreviewSource).toContain("48 checks passing");
    expect(operationsPreviewSource).toContain("Recovery confirmed");
    expect(operationsPreviewSource).toContain("Update delivered");
    expect(operationsPreviewSource).toContain("Your network. Your data.");
    expect(operationsPreviewSource).not.toContain("canvas");
  });
});
