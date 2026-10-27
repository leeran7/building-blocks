/**
 * Every bottom sheet holds keyboard focus (plan step 3.2): focus moves into
 * the sheet when it opens, Tab and Shift+Tab wrap inside it, only the top
 * sheet of a stack keeps Tab, and focus returns to the opener on close.
 *
 * @vitest-environment happy-dom
 */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { SheetPortal } from "../../mobile/src/components/SheetPortal";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Sheet({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <SheetPortal
      scrim={
        // As the real sheets do: a tap-to-close scrim kept out of the Tab order.
        <button type="button" aria-label="Close" tabIndex={-1} />
      }
    >
      <div role="dialog" aria-modal="true" aria-label={name}>
        <button type="button">{name} first</button>
        <button type="button">{name} last</button>
        {children}
      </div>
    </SheetPortal>
  );
}

function Screen() {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      {open && (
        <Sheet name="card">
          {/* A second sheet opened from the first, as Get gems opens over a level card. */}
          <button type="button" onClick={() => setPacks(true)}>
            get gems
          </button>
          {packs && <Sheet name="packs" />}
        </Sheet>
      )}
    </>
  );
}

const byText = (t: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === t)!;
const tab = (shiftKey = false) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));
  });

async function open() {
  await act(async () => root.render(<Screen />));
  byText("opener").focus();
  await act(async () => byText("opener").click());
}

describe("SheetPortal focus", () => {
  it("moves focus to the sheet panel when it opens", async () => {
    await open();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("card");
  });

  it("wraps Tab and Shift+Tab inside the sheet", async () => {
    await open();
    byText("get gems").focus();
    tab();
    expect(document.activeElement?.textContent).toBe("card first");
    tab(true);
    expect(document.activeElement?.textContent).toBe("get gems");
  });

  it("pulls focus back in when it has wandered outside", async () => {
    await open();
    byText("close").focus();
    tab();
    expect(document.activeElement?.textContent).toBe("card first");
  });

  it("keeps Tab in the top sheet of a stack", async () => {
    await open();
    byText("get gems").focus();
    await act(async () => byText("get gems").click());
    expect(document.activeElement?.getAttribute("aria-label")).toBe("packs");
    byText("packs last").focus();
    tab();
    expect(document.activeElement?.textContent).toBe("packs first");
    // Mid-sheet, the card underneath must not pull focus down to itself.
    tab();
    expect(document.activeElement?.textContent).toBe("packs first");
  });

  it("gives focus back to the opener on close", async () => {
    await open();
    byText("card first").focus();
    await act(async () => byText("close").click());
    expect(document.activeElement?.textContent).toBe("opener");
  });
});
