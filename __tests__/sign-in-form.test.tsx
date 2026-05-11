// File: __tests__/sign-in-form.test.tsx

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signInWithPasswordMock, signInWithOAuthMock, pushMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserSupabase: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signInWithOAuth: signInWithOAuthMock,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { SignInForm } from "@/app/sign-in/sign-in-form";

describe("<SignInForm>", () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signInWithOAuthMock.mockReset();
    pushMock.mockReset();
    Object.defineProperty(window, "location", {
      value: { origin: "https://lex-web-eta.vercel.app" },
      configurable: true,
      writable: true,
    });
  });

  it("calls signInWithPassword and routes to / on success", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({ error: null });

    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Имейл"), {
      target: { value: "test@example.bg" },
    });
    fireEvent.change(screen.getByLabelText("Парола"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^влез$/i }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "test@example.bg",
        password: "secret",
      });
    });
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("shows Bulgarian error on invalid credentials", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Имейл"), {
      target: { value: "wrong@example.bg" },
    });
    fireEvent.change(screen.getByLabelText("Парола"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^влез$/i }));

    expect(await screen.findByText(/невалидни данни/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("calls signInWithOAuth with provider=google and /auth/callback?next=/", async () => {
    signInWithOAuthMock.mockResolvedValueOnce({ error: null });

    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: /влез с google/i }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "https://lex-web-eta.vercel.app/auth/callback?next=/",
        },
      });
    });
  });

  it("renders cross-link to /sign-up", () => {
    render(<SignInForm />);
    const link = screen.getByRole("link", { name: /регистрирай се/i });
    expect(link).toHaveAttribute("href", "/sign-up");
  });
});
