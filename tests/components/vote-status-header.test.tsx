import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { VoteStatusHeader } from "@/components/days-parlay/vote-status-header";

describe("VoteStatusHeader", () => {
  test('renders "Your vote: unspent" when myVote is null', () => {
    render(<VoteStatusHeader myVote={null} legNumber={null} />);

    expect(screen.getByText("Your vote: unspent")).toBeInTheDocument();
  });

  test("renders the spent state with the leg number, market question, and a jump link", () => {
    render(
      <VoteStatusHeader
        myVote={{ legId: "leg-3", marketQuestion: "Will the home team win?" }}
        legNumber={3}
      />
    );

    expect(
      screen.getByText("Your vote: spent on Leg 3: Will the home team win?")
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Jump to leg" });
    expect(link).toHaveAttribute("href", "#leg-leg-3");
  });

  test("is announced via a status region so a screen reader user perceives the change", () => {
    const { rerender } = render(<VoteStatusHeader myVote={null} legNumber={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Your vote: unspent");

    rerender(
      <VoteStatusHeader
        myVote={{ legId: "leg-1", marketQuestion: "Will it rain?" }}
        legNumber={1}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your vote: spent on Leg 1: Will it rain?"
    );
  });
});
