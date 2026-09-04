/**
 * /browse — folded into the landing page.
 *
 * Tower discovery now lives on the landing directory (family filters + a grid of
 * every tower, paid + game). This route redirects there to keep old links alive.
 */

import { permanentRedirect } from "next/navigation";

export default function BrowsePage() {
  permanentRedirect("/#towers");
}
