// File: __tests__/vote-button.test.tsx
//
// Covers <VoteButton> behaviors from 06.1-01 PLAN Task 3 <behavior>:
//  Anonymous variant (D-01, AUTH-08):
//   - disabled button + 'Влез за глас' sign-in link with URL-encoded returnTo
//   - count + plural form rendered ("1 глас" vs "N гласа")
//   - disabled button has Bulgarian title tooltip mentioning sign-in
//  Authed variant (D-01, AUTH-10):
//   - enabled button, no sign-in link
//   - POST body has only {finding_id}, no fingerprint
//   - count updates on success and label becomes "✓ Гласувахте"

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { VoteButton } from "@/app/audit/vote-button";

describe("<VoteButton> anonymous variant (user=null)", () => {
  it("renders disabled button + 'Влез за глас' sign-in link with URL-encoded returnTo (D-01)", () => {
    render(
      <VoteButton
        findingId="abc-123"
        initialCount={42}
        user={null}
        currentPath="/audit/finding/abc-123"
      />,
    );
    const button = screen.getByRole("button", { name: /Подкрепи/ });
    expect(button).toBeDisabled();
    const link = screen.getByRole("link", { name: /Влез за глас/ });
    expect(link).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Faudit%2Ffinding%2Fabc-123",
    );
  });

  it("renders count + singular form 'глас' when count == 1", () => {
    render(
      <VoteButton
        findingId="abc"
        initialCount={1}
        user={null}
        currentPath="/audit/finding/abc"
      />,
    );
    expect(screen.getByText(/1 глас/)).toBeInTheDocument();
    expect(screen.queryByText(/гласа/)).toBeNull();
  });

  it("renders plural 'гласа' when count != 1", () => {
    render(
      <VoteButton
        findingId="abc"
        initialCount={42}
        user={null}
        currentPath="/audit/finding/abc"
      />,
    );
    expect(screen.getByText(/42 гласа/)).toBeInTheDocument();
  });

  it("disabled button has a Bulgarian title tooltip mentioning sign-in", () => {
    render(
      <VoteButton
        findingId="abc"
        initialCount={0}
        user={null}
        currentPath="/audit/finding/abc"
      />,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("title")?.toLowerCase()).toContain("влез");
  });
});

describe("<VoteButton> authed variant (user truthy)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders enabled button and no sign-in link", () => {
    render(
      <VoteButton
        findingId="abc"
        initialCount={42}
        user={{ id: "u-1" }}
        currentPath="/audit/finding/abc"
      />,
    );
    const button = screen.getByRole("button", { name: /Подкрепи/ });
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/Влез за глас/)).toBeNull();
  });

  it("POSTs only finding_id (no fingerprint) and updates count on success", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, new_count: 43 }), {
        status: 200,
      }) as Response,
    );
    render(
      <VoteButton
        findingId="abc"
        initialCount={42}
        user={{ id: "u-1" }}
        currentPath="/audit/finding/abc"
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ finding_id: "abc" });
    expect(body).not.toHaveProperty("fingerprint");
    await waitFor(() =>
      expect(screen.getByText(/43/)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText(/Гласувахте/)).toBeInTheDocument(),
    );
  });
});
