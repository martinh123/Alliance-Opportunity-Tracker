// MEDDPICC qualification metadata and presentation helpers.
//
// Element guidance reflects current (2025) MEDDPICC best practice: each element
// carries a short description, the concrete information a rep should capture
// ("what to capture"), and the discovery questions that surface it.

export type MeddpiccMeta = {
  label: string;
  letter: string;
  description: string;
  capture: string[];
  questions: string[];
};

export const MEDDPICC_META: Record<string, MeddpiccMeta> = {
  metrics: {
    label: "Metrics",
    letter: "M",
    description:
      "The quantified business outcome the customer expects — in their own numbers. Without a number, value is asserted, not proven.",
    capture: [
      "Baseline current-state KPIs (cost, time, revenue, risk)",
      "Target future-state KPIs after the solution is deployed",
      "Financial impact / cost of inaction",
      "The customer's own definition of success in numbers",
    ],
    questions: [
      "What KPIs is the executive team tracking this quarter?",
      "Can you quantify what this problem costs today?",
      "What does success look like in 12 months, in numbers?",
    ],
  },
  economic_buyer: {
    label: "Economic Buyer",
    letter: "E",
    description:
      "The person with discretionary authority to release budget and give the final yes/no. Selling only to a champion risks a veto.",
    capture: [
      "Name, title, and reporting line",
      "Their personal and business priorities",
      "Budget ownership and approval thresholds",
      "Whether you have met them directly and their engagement level",
    ],
    questions: [
      "Who ultimately owns the budget for this initiative?",
      "If everyone says yes but one person says no, whose no matters most?",
      "Is there anyone else who would need to formally approve?",
    ],
  },
  decision_criteria: {
    label: "Decision Criteria",
    letter: "D",
    description:
      "The standards and requirements the customer will use to pick a winner — technical, business, and political. Shape these early so your strengths become their requirements.",
    capture: [
      "Technical requirements (integration, security, compliance, scale)",
      "Business requirements (ROI threshold, timeline, support SLAs)",
      "How criteria are weighted and who owns each",
      "Where you win head-to-head vs. where gaps exist",
    ],
    questions: [
      "What are your top 3 must-haves for any solution?",
      "How are you weighting these requirements against each other?",
      "What would make you say 'we've found our vendor'?",
    ],
  },
  decision_process: {
    label: "Decision Process",
    letter: "D",
    description:
      "Every step and stakeholder between today and a signed agreement. Unknown steps become surprise delays.",
    capture: [
      "Each formal step from evaluation to signature",
      "Stakeholders at each step (name, role, influence)",
      "Internal approval gates / committee reviews",
      "Timeline, key milestones, and decision deadline",
    ],
    questions: [
      "Walk me through every step to get to a signed agreement.",
      "Who else needs to be involved before a final decision?",
      "Have you bought something similar before — what was that like?",
    ],
  },
  paper_process: {
    label: "Paper Process",
    letter: "P",
    description:
      "The procurement, legal, and security gauntlet after the verbal yes. Deals slip because nobody mapped the steps from yes to signature.",
    capture: [
      "Procurement / vendor approval requirements",
      "Legal review steps (MSA, DPA, redlines)",
      "IT / InfoSec sign-off and security review timelines",
      "Signature authority and typical time from yes to ink",
    ],
    questions: [
      "Once we agree on terms, what happens internally before signature?",
      "Do you have a standard security review, and how long does it take?",
      "Who in legal and procurement needs to review the agreement?",
    ],
  },
  identify_pain: {
    label: "Identify Pain",
    letter: "I",
    description:
      "The specific, quantified problem tied to a deadline. Weak or undated pain means low priority and no budget.",
    capture: [
      "The named business problem (root cause, not symptom)",
      "Who feels the pain most acutely (role / level)",
      "Financial and operational consequence of inaction",
      "The compelling event that makes now the right time",
    ],
    questions: [
      "What's the risk of doing nothing for another 6 months?",
      "Who in the business is most affected day-to-day?",
      "What triggered the decision to look for a solution now?",
    ],
  },
  champion: {
    label: "Champion",
    letter: "C",
    description:
      "An internal advocate with influence who actively sells for you when you're not in the room — and has been tested to prove it.",
    capture: [
      "Name, role, and level of organizational influence",
      "Their personal motivation / what's in it for them",
      "Their access to and influence over the economic buyer",
      "Proof they act (not just a friendly, responsive coach)",
    ],
    questions: [
      "Who internally is most excited about solving this?",
      "Can you introduce me to the economic buyer?",
      "What would you tell your CEO about why you recommend us?",
    ],
  },
  competition: {
    label: "Competition",
    letter: "C",
    description:
      "Every alternative the customer is weighing — other vendors, an internal build, and doing nothing (the status quo).",
    capture: [
      "Named competitors on the shortlist and their perceived strengths",
      "Where you win head-to-head and where you're vulnerable",
      "Any internal build / DIY alternative being considered",
      "The customer's view of the status quo as an option",
    ],
    questions: [
      "Who else are you evaluating for this?",
      "What would building this internally instead look like?",
      "What would make you choose a competitor over us?",
    ],
  },
};

export const ELEMENTS = Object.keys(MEDDPICC_META);

export type QualificationLevel = "strong" | "moderate" | "weak" | "unqualified";

export type QualificationBand = {
  level: QualificationLevel;
  label: string;
  blurb: string;
  text: string;
  bg: string;
  border: string;
  bar: string;
  dot: string;
};

// Maps a 0-100 overall MEDDPICC score to a qualification band with
// presentation classes. Threshold of 75 reflects the common best-practice
// commit-forecast bar.
export function qualificationBand(score: number): QualificationBand {
  if (score >= 75) {
    return {
      level: "strong",
      label: "Strong",
      blurb: "Commit-ready",
      text: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-50 dark:bg-emerald-900/30",
      border: "border-emerald-200 dark:border-emerald-800",
      bar: "bg-emerald-500",
      dot: "bg-emerald-500",
    };
  }
  if (score >= 50) {
    return {
      level: "moderate",
      label: "Moderate",
      blurb: "Developing",
      text: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-900/30",
      border: "border-amber-200 dark:border-amber-800",
      bar: "bg-amber-400",
      dot: "bg-amber-400",
    };
  }
  if (score >= 25) {
    return {
      level: "weak",
      label: "Weak",
      blurb: "Early-stage",
      text: "text-orange-700 dark:text-orange-300",
      bg: "bg-orange-50 dark:bg-orange-900/30",
      border: "border-orange-200 dark:border-orange-800",
      bar: "bg-orange-400",
      dot: "bg-orange-400",
    };
  }
  return {
    level: "unqualified",
    label: "Unqualified",
    blurb: "Needs discovery",
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800/60",
    border: "border-slate-200 dark:border-slate-700",
    bar: "bg-slate-400",
    dot: "bg-slate-400",
  };
}
