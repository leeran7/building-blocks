/**
 * The Sign In screen's email form: "Forgot password?" emails a reset link,
 * answers the same whether or not the email has an account, and asks for the
 * email first when it is empty.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({ resetPassword: vi.fn(async (_email: string) => {}) }));
vi.mock("../../mobile/src/contexts/AuthContext", () => ({
  useAuth: () => ({
    signInApple: vi.fn(async () => {}),
    signInGoogle: vi.fn(async () => {}),
    signInEmail: vi.fn(async () => {}),
    createAccount: vi.fn(async () => {}),
    resetPassword: auth.resetPassword,
  }),
}));
vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));

import { SignInScreen } from "../../mobile/src/screens/SignInScreen";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  auth.resetPassword.mockReset();
  auth.resetPassword.mockImplementation(async () => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("element to click not found");
  await act(async () => {
    el.click();
  });
}

async function openEmailForm() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SignInScreen />
      </MemoryRouter>,
    );
  });
  await click(button("Sign in with Email"));
}

async function typeEmail(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]');
  if (!input) throw new Error("no email field");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const status = () => container.querySelector('[role="status"]')?.textContent ?? null;
const alert = () => container.querySelector('[role="alert"]')?.textContent ?? null;

describe("Sign In: Forgot password", () => {
  it("emails a reset link to the address typed", async () => {
    await openEmailForm();
    await typeEmail(" climber@example.com ");
    await click(button("Forgot password?"));
    expect(auth.resetPassword).toHaveBeenCalledWith("climber@example.com");
    expect(status()).toContain("If an account uses climber@example.com, a reset link is on its way.");
    expect(alert()).toBeNull();
  });

  it("gives the same reply when no account has that email", async () => {
    auth.resetPassword.mockRejectedValue(Object.assign(new Error("no user"), { code: "auth/user-not-found" }));
    await openEmailForm();
    await typeEmail("nobody@example.com");
    await click(button("Forgot password?"));
    expect(status()).toContain("a reset link is on its way");
    expect(alert()).toBeNull();
  });

  it("says why when the reset can't be sent", async () => {
    auth.resetPassword.mockRejectedValue(Object.assign(new Error("bad"), { code: "auth/invalid-email" }));
    await openEmailForm();
    await typeEmail("not-an-email");
    await click(button("Forgot password?"));
    expect(alert()).toBe("Enter a valid email address.");
    expect(status()).toBeNull();
  });

  it("asks for the email first instead of sending to nobody", async () => {
    await openEmailForm();
    await click(button("Forgot password?"));
    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(alert()).toBe("Enter your email above, then tap Forgot password.");
  });

  it("is offered on Sign In only, not on Create Account", async () => {
    await openEmailForm();
    expect(button("Forgot password?")).toBeTruthy();
    await click(button("Create account"));
    expect(button("Forgot password?")).toBeUndefined();
  });
});
