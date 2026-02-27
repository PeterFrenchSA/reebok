"use client";

type DecisionTrackingData = {
  eligibleVoters: number;
  totalVotes: number;
  yes: number;
  no: number;
  abstain: number;
  participationPct: number;
};

function pct(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Number(((value / total) * 100).toFixed(1));
}

type BarProps = {
  label: string;
  value: number;
  total: number;
  tone: "yes" | "no" | "abstain" | "turnout";
};

function TrackingBar({ label, value, total, tone }: BarProps) {
  const percentage = pct(value, total);
  return (
    <div className="tracking-row">
      <div className="tracking-label">
        <span>{label}</span>
        <span>
          {value} ({percentage}%)
        </span>
      </div>
      <div className="tracking-bar">
        <div className={`tracking-fill tracking-${tone}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function DecisionTracking({ tracking }: { tracking: DecisionTrackingData }) {
  return (
    <section className="tracking-grid" aria-label="Vote tracking">
      <TrackingBar
        label="Turnout"
        value={tracking.totalVotes}
        total={tracking.eligibleVoters}
        tone="turnout"
      />
      <TrackingBar label="Yes" value={tracking.yes} total={tracking.totalVotes} tone="yes" />
      <TrackingBar label="No" value={tracking.no} total={tracking.totalVotes} tone="no" />
      <TrackingBar label="Abstain" value={tracking.abstain} total={tracking.totalVotes} tone="abstain" />
    </section>
  );
}
