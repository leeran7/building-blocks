/**
 * JSON-LD for public pages. WebPage only — we do not host an MP4, so never
 * emit VideoObject or contentUrl.
 */

export interface WebPageJsonLd {
  "@context": string;
  "@type": "WebPage";
  url: string;
  name: string;
  description: string;
}

export function buildWebPageJsonLd(input: {
  url: string;
  name: string;
  description: string;
}): WebPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: input.url,
    name: input.name,
    description: input.description,
  };
}

export function jsonLdScriptHtml(data: WebPageJsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
