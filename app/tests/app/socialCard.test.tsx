import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRow, type BlockRowProps } from "../../src/components/Tower/BlockRow";
import { SocialMark } from "../../src/components/Social/SocialMark";
import { SOCIAL_PLATFORMS } from "../../src/lib/socialHandle";

const base: BlockRowProps = {
  id: "b1",
  slug: "acme",
  url: "https://example.com/path",
  display_name: "Acme",
  altitude: 12.3,
  rank: 2,
  buried: false,
  amber_edge: false,
  views_served: 100,
  maxAltitude: 20,
};

describe("BlockRow — outbound link + native social card", () => {
  it("routes the outbound link through the tracked /go/[slug] redirect", () => {
    const html = renderToStaticMarkup(createElement(BlockRow, base));
    expect(html).toContain('href="/go/acme"');
    // The raw destination URL is never a direct href on the row.
    expect(html).not.toContain('href="https://example.com/path"');
  });

  it("shows the domain for a website listing", () => {
    const html = renderToStaticMarkup(createElement(BlockRow, base));
    expect(html).toContain("example.com");
  });

  it("shows @handle + the platform glyph for a social listing", () => {
    const html = renderToStaticMarkup(
      createElement(BlockRow, {
        ...base,
        platform: "TIKTOK",
        handle: "creator",
      })
    );
    expect(html).toContain("@creator");
    expect(html).toContain('data-social-platform="TIKTOK"');
    // Native card replaces the domain line.
    expect(html).not.toContain("example.com");
  });
});

describe("SocialMark — one distinct glyph per platform", () => {
  it("tags each glyph with its platform and renders an svg", () => {
    for (const p of SOCIAL_PLATFORMS) {
      const html = renderToStaticMarkup(createElement(SocialMark, { platform: p }));
      expect(html).toContain(`data-social-platform="${p}"`);
      expect(html).toContain("<svg");
    }
  });

  it("is decorative (aria-hidden) unless given a title", () => {
    const hidden = renderToStaticMarkup(
      createElement(SocialMark, { platform: "X" })
    );
    expect(hidden).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(
      createElement(SocialMark, { platform: "X", title: "X" })
    );
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>X</title>");
  });
});
