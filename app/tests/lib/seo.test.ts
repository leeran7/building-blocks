import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  absoluteUrl,
  ogImageUrl,
  buildMetadata,
  organizationJsonLd,
  websiteJsonLd,
} from "../../src/lib/seo";

describe("absoluteUrl", () => {
  it("joins the site origin with a leading-slash path", () => {
    expect(absoluteUrl("/climb")).toBe(`${SITE_URL}/climb`);
  });

  it("adds the leading slash if the caller forgot it", () => {
    expect(absoluteUrl("climb")).toBe(`${SITE_URL}/climb`);
  });
});

describe("ogImageUrl", () => {
  it("defaults to a bare /api/og URL when no params are given", () => {
    expect(ogImageUrl()).toBe(`${SITE_URL}/api/og`);
  });

  it("percent-encodes every param via URLSearchParams — never raw string concat", () => {
    // block display_name / category labels are user-submitted or contain
    // spaces/&; a manual template-string build would corrupt the query string
    // or the resulting <meta> tag (this replaced exactly that pattern).
    const url = ogImageUrl({ name: "Ampersand & <script> Co" });
    expect(url).not.toContain("<script>");
    expect(url).not.toContain(" ");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("name")).toBe("Ampersand & <script> Co");
  });

  it("omits params that were not provided", () => {
    const url = ogImageUrl({ name: "Stack" });
    const parsed = new URL(url);
    expect(parsed.searchParams.has("alt")).toBe(false);
    expect(parsed.searchParams.has("rank")).toBe(false);
  });
});

describe("buildMetadata", () => {
  it("sets a matching canonical, OG url, and OG/Twitter title+description", () => {
    const meta = buildMetadata({
      title: "Indie Games Stack — Stack",
      description: "The Indie Games leaderboard.",
      path: "/stack/indie-games",
    });

    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/stack/indie-games`);
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/stack/indie-games`);
    expect(meta.openGraph?.title).toBe("Indie Games Stack — Stack");
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Indie Games Stack — Stack",
    });
  });

  it("defaults the OG/Twitter image to the bare /api/og route when none is given", () => {
    const meta = buildMetadata({ title: "T", description: "D", path: "/climb" });
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0]!.url).toBe(`${SITE_URL}/api/og`);
    expect(meta.twitter?.images).toEqual([`${SITE_URL}/api/og`]);
  });

  it("uses a caller-supplied image over the default", () => {
    const meta = buildMetadata({
      title: "T",
      description: "D",
      path: "/b/some-slug",
      image: "https://example.test/custom.png",
    });
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0]!.url).toBe("https://example.test/custom.png");
  });

  it("omits the robots field entirely when not given (no accidental noindex)", () => {
    const meta = buildMetadata({ title: "T", description: "D", path: "/climb" });
    expect(meta.robots).toBeUndefined();
  });

  it("passes through an explicit robots directive (e.g. noindex for hidden/404 pages)", () => {
    const meta = buildMetadata({
      title: "T",
      description: "D",
      path: "/b/hidden-slug",
      robots: { index: false },
    });
    expect(meta.robots).toEqual({ index: false });
  });
});

describe("organizationJsonLd / websiteJsonLd", () => {
  it("share the same site name and a website→organization publisher link", () => {
    const org = organizationJsonLd();
    const site = websiteJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(site["@type"]).toBe("WebSite");
    expect(site.publisher).toEqual({ "@id": org["@id"] });
  });
});
