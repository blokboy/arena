import React from "react";

export type MemberVoteTally = {
  totalMemberStake: string;
  yesStake: string;
  members: Array<{
    userId: string;
    username: string;
    amount: string;
    sharePct: number;
    votingYes: boolean;
  }>;
} | null;

type RolloverControlProps = {
  memberVoteTally: MemberVoteTally;
  isFinalLeg: boolean;
};

// Read-only: no vote-cast endpoint exists yet, so this renders the live
// stake-weighted tally with no toggle. Full voting is a follow-up issue.
export function RolloverControl({ memberVoteTally, isFinalLeg }: RolloverControlProps) {
  if (isFinalLeg || !memberVoteTally) {
    return null;
  }

  const percentage = Math.round(
    (Number(memberVoteTally.yesStake) / Number(memberVoteTally.totalMemberStake)) * 100
  );

  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <p aria-live="polite" className="font-medium text-slate-900">
        {percentage}% of member stake voting to roll over — need &gt;50%
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-slate-600">
        {memberVoteTally.members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3">
            <span>{member.username}</span>
            <span>{Math.round(member.sharePct * 100)}%</span>
            <span>{member.votingYes ? "Voting yes" : "Not voting"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
