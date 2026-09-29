import type { ReactNode } from "react";
import { SWIPE_HANDLE_ATTR } from "./useSwipeDismiss";

/**
 * A bottom sheet's grab handle and drag zone for useSwipeDismiss: a drag that
 * starts here always moves the sheet (touch-none: it is never a scroll). Put
 * the sheet's header in `children` to make it part of the zone. Only use this
 * on a sheet that can actually be swiped away; the bar promises it.
 */
export function SheetHandle({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div {...{ [SWIPE_HANDLE_ATTR]: "" }} className={`touch-none ${className}`}>
      <span aria-hidden className="mx-auto block h-1 w-9 rounded-full bg-border-strong" />
      {children !== undefined && <div className="mt-2">{children}</div>}
    </div>
  );
}
