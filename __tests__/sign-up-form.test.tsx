// File: __tests__/sign-up-form.test.tsx
//
// Asserts <SignUpForm /> behavior:
//  - signUp invoked with email, password, options.data.display_name, options.emailRedirectTo
//  - successful signUp routes to /sign-up/check-email
//  - duplicate-email error → Bulgarian message displayed
//  - submit disabled when any field is blank/whitespace

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signUpMock, pushMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserSupabase: () => ({
    auth: { signUp: signUpMock },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { SignUpForm } from "@/app/sign-up/sign-up-form";

describe("<SignUpForm>", () => {
  beforeEach(() => {
    signUpMock.mockReset();
    pushMock.mockReset();
    // jsdom needs window.location.origin for emailRedirectTo construction
    Object.defineProperty(window, "location", {
      value: { origin: "https://lex-web-eta.vercel.app" },
      configurable: true,
      writable: true,
    });
  });

  function fillFields({
    email = "test@example.bg",
    password = "supersecret",
    displayName = "Иван Петров",
  } = {}) {
    fireEvent.change(screen.getByLabelText("Имейл"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText("Парола"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: displayName } });
  }

  it("calls supabase.auth.signUp with email, password, display_name, emailRedirectTo", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    render(<SignUpForm />);
    fillFields();
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith({
        email: "test@example.bg",
        password: "supersecret",
        options: {
          emailRedirectTo: "https://lex-web-eta.vercel.app/auth/callback?next=/",
          data: { display_name: "Иван Петров" },
        },
      });
    });
  });

  it("routes to /sign-up/check-email on success", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    render(<SignUpForm />);
    fillFields();
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/sign-up/check-email");
    });
  });

  it("shows Bulgarian error on duplicate email", async () => {
    signUpMock.mockResolvedValueOnce({
      data: null,
      error: { message: "User already registered" },
    });

    render(<SignUpForm />);
    fillFields();
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    expect(await screen.findByText(/вече регистриран/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("disables submit when display name is whitespace-only (D-03 required field)", () => {
    render(<SignUpForm />);
    fireEvent.change(screen.getByLabelText("Имейл"), { target: { value: "a@b.bg" } });
    fireEvent.change(screen.getByLabelText("Парола"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "   " } });

    const button = screen.getByRole("button", { name: /регистрирай/i });
    expect(button).toBeDisabled();
  });

  it("trims email and display name before calling signUp", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    render(<SignUpForm />);
    fillFields({ email: "  trim@me.bg  ", displayName: "  Иван  " });
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    await waitFor(() => {
      const call = signUpMock.mock.calls[0][0];
      expect(call.email).toBe("trim@me.bg");
      expect(call.options.data.display_name).toBe("Иван");
    });
  });
});
