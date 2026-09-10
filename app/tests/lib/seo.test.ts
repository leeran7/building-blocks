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
  it("returns the bare /api/og brand image URL", () => {
    expect(ogImageUrl()).toBe(`${SITE_URL}/api/og`);
  });
});

describe("buildMetadata", () => {
  it("sets a matching canonical, OG url, and OG/Twitter title+description", () => {
    const meta = buildMetadata({
      title: "Free climb leaderboard — Doomstack",
      description: "The global free-climb leaderboard.",
      path: "/climb",
    });

    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/climb`);
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/climb`);
    expect(meta.openGraph?.title).toBe("Free climb leaderboard — Doomstack");
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Free climb leaderboard — Doomstack",
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
      path: "/duel",
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
      path: "/c/hidden-user",
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
