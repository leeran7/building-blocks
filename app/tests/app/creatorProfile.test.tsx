import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatorProfile } from "../../src/components/Creator/CreatorProfile";
import type { CreatorProfile as CreatorProfileData } from "../../src/db/creator";

const base: CreatorProfileData = {
  username: "elena-voss",
  name: "Elena Voss",
  social: { TIKTOK: "elenacooks", YOUTUBE: "elenavoss" },
  freeClimb: { peakY: 1204, rank: 7, wins: 3, totalClimbers: 50, handle: "Elena Voss" },
  replays: [],
};

describe("CreatorProfile — social chip row", () => {
  it("renders a chip per linked platform, linking to the profile URL", () => {
    const html = renderToStaticMarkup(createElement(CreatorProfile, { profile: base }));
    expect(html).toContain('data-social-platform="TIKTOK"');
    expect(html).toContain('data-social-platform="YOUTUBE"');
    expect(html).toContain("https://www.tiktok.com/@elenacooks");
    expect(html).toContain("@elenacooks");
    // Chips link out in a new tab, no-follow.
    expect(html).toContain('rel="noopener nofollow"');
    // Unlinked platforms produce no chip.
    expect(html).not.toContain('data-social-platform="TWITCH"');
  });

  it("renders the header identity and the climbing record", () => {
    const html = renderToStaticMarkup(createElement(CreatorProfile, { profile: base }));
    expect(html).toContain("Elena Voss");
    expect(html).toContain("@elena-voss");
    expect(html).toContain("Climbing");
  });

  it("shows an empty state when there is no climb", () => {
    const empty: CreatorProfileData = {
      ...base,
      social: {},
      freeClimb: null,
    };
    const html = renderToStaticMarkup(createElement(CreatorProfile, { profile: empty }));
    expect(html).toContain("Nothing plotted yet");
  });
});
