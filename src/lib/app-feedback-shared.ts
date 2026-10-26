export const feedbackStatuses = ["NEW", "UNDER_REVIEW", "PLANNED", "RESOLVED"] as const;
export const feedbackCategories = ["PROBLEM", "SUGGESTION", "COMMENT"] as const;
export type FeedbackStatus = typeof feedbackStatuses[number];
export type FeedbackCategory = typeof feedbackCategories[number];
export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  NEW: "New", UNDER_REVIEW: "Under Review", PLANNED: "Planned", RESOLVED: "Resolved"
};
export const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  PROBLEM: "Problem", SUGGESTION: "Suggestion", COMMENT: "General comment"
};

export type AppFeedbackItem = {
  id: string; title: string; body: string; category: FeedbackCategory; status: FeedbackStatus;
  version: number; author: { id: string; name: string } | null;
  createdAt: string; updatedAt: string; _count: { entries: number };
};
export type AppFeedbackEntryItem = {
  id: string; body: string | null; fromStatus: FeedbackStatus | null; toStatus: FeedbackStatus | null;
  author: { id: string; name: string } | null; createdAt: string;
};
