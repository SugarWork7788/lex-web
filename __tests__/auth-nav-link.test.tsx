// File: __tests__/auth-nav-link.test.tsx

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/use-session", () => ({
  useSession: () => useSessionMock(),
}));

import { AuthNavLink } from "@/app/auth-nav-link";

describe("<AuthNavLink>", () => {
  it("renders nothing while loading (prevents SSR/CSR flash)", () => {
    useSessionMock.mockReturnValue({ user: null, loading: true });
    const { container } = render(<AuthNavLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'Влез' link to /sign-in for anonymous user", () => {
    useSessionMock.mockReturnValue({ user: null, loading: false });
    render(<AuthNavLink />);
    const link = screen.getByRole("link", { name: /^влез$/i });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("renders 'Профил' link to /profile for signed-in user", () => {
    useSessionMock.mockReturnValue({
      user: { id: "u-1", email: "a@b.bg" },
      loading: false,
    });
    render(<AuthNavLink />);
    const link = screen.getByRole("link", { name: /^профил$/i });
    expect(link).toHaveAttribute("href", "/profile");
  });

  it("uses hover:underline underline-offset-4 (D-09 navbar pattern)", () => {
    useSessionMock.mockReturnValue({ user: null, loading: false });
    render(<AuthNavLink />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("hover:underline");
    expect(link.className).toContain("underline-offset-4");
  });
});
