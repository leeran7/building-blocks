/**
 * SiteFooter -- server component wrapper rendered once in the root layout.
 *
 * The auth-dependent CTA visibility is handled by SiteFooterAuth (client
 * island). This wrapper stays a server component so the static Footer
 * shell can be server-rendered when the auth island is not needed.
 */

import { SiteFooterAuth } from "./SiteFooterAuth";

export function SiteFooter() {
  return <SiteFooterAuth />;
}
