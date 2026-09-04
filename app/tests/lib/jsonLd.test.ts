import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { JsonLd } from "../../src/components/JsonLd";

describe("JsonLd", () => {
  it("wraps a single node in @context", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: { "@type": "WebSite" } }));
    const raw = html.match(/>([^<]*)</)![1]!;
    expect(JSON.parse(raw)).toEqual({ "@context": "https://schema.org", "@type": "WebSite" });
  });

  it("wraps an array of nodes in a @graph", () => {
    const html = renderToStaticMarkup(
      createElement(JsonLd, { data: [{ "@type": "Organization" }, { "@type": "WebSite" }] })
    );
    const raw = html.match(/>([^<]*)</)![1]!;
    const parsed = JSON.parse(raw);
    expect(parsed["@graph"]).toHaveLength(2);
  });

  it("escapes </script> in embedded user-submitted strings so it cannot break out of the tag", () => {
    // Mirrors block.display_name flowing into BreadcrumbList JSON-LD on /b/[slug].
    const payload = { "@type": "ListItem", name: '</script><script>alert(1)</script>' };
    const html = renderToStaticMarkup(createElement(JsonLd, { data: payload }));

    expect(html).not.toContain("</script><script>");
    // The serialized JSON-LD script tag itself is the only <script> in the markup.
    expect(html.match(/<script/g)).toHaveLength(1);

    const raw = html.match(/>([\s\S]*)</)![1]!;
    // < round-trips back through JSON.parse to a literal "<".
    expect(JSON.parse(raw).name).toBe('</script><script>alert(1)</script>');
  });
});
