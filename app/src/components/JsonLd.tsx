/** Renders one or more JSON-LD nodes as a single application/ld+json script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  // Some nodes embed user-submitted strings (e.g. block display_name in
  // BreadcrumbList). Escape "<" so a value containing "</script>" can't break
  // out of this tag — JSON.stringify alone does not do this.
  const serialized = JSON.stringify(json).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}
