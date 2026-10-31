"use client";

import { useEffect } from "react";

/**
 * Sets `data-soft-nav` on <html> once the visitor moves between pages without a
 * full load (a same-origin link click, or back / forward). globals.css then
 * skips the one-shot page entrances (`.climb-reveal`, `.reveal`, the landing
 * headline drop…), which belong to the first paint: replayed on every switch
 * they faded the new page in from blank and moved it after it had arrived. Set
 * on the click itself so it is in place before Next renders the next page; a
 * reload clears it.
 */
export function SoftNavigationFlag() {
  useEffect(() => {
    const mark = () => {
      document.documentElement.dataset.softNav = "";
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin) mark();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", mark);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", mark);
    };
  }, []);

  return null;
}
