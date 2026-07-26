import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicFooter, PublicHeader } from "../components/public/PublicChrome";
import { templateDesign } from "../lib/page-design";

describe("public support link placement", () => {
  it("renders support with legal footer links instead of in the header", () => {
    const design = templateDesign("CENTERED_SUMMARY");
    const header = renderToStaticMarkup(
      <PublicHeader
        name="Status"
        supportUrl="https://example.com/support"
        allowThemeOverride={false}
        design={design}
      />,
    );
    const footer = renderToStaticMarkup(
      <PublicFooter
        removeBranding={false}
        supportUrl="https://example.com/support"
        termsUrl="https://example.com/terms"
        privacyUrl="https://example.com/privacy"
        design={design}
      />,
    );

    expect(header).not.toContain("Support");
    expect(footer).toContain('href="https://example.com/support"');
    expect(footer).toContain("Support");
    expect(footer).toContain("Terms of Service");
    expect(footer).toContain("Privacy Policy");
  });

  it("does not render a support item when no valid support URL is configured", () => {
    const footer = renderToStaticMarkup(
      <PublicFooter
        removeBranding={false}
        supportUrl=""
        termsUrl="https://example.com/terms"
        privacyUrl={null}
        design={templateDesign("CENTERED_SUMMARY")}
      />,
    );

    expect(footer).not.toContain(">Support<");
    expect(footer).toContain("Terms of Service");
  });

  it("renders show-full covers as responsive images without cropping", () => {
    const header = renderToStaticMarkup(
      <PublicHeader
        name="Status"
        coverImageUrl="/assets/cover.png"
        coverImageFit="CONTAIN"
        allowThemeOverride={false}
      />,
    );

    expect(header).toContain('src="/assets/cover.png"');
    expect(header).toContain('alt="Status cover image"');
    expect(header).toContain("object-contain");
    expect(header).not.toContain("background-image");
  });
});
