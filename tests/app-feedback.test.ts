import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission } from "../src/lib/rbac";
import { feedbackCategories, feedbackCategoryLabels, feedbackStatuses, feedbackStatusLabels } from "../src/lib/app-feedback-shared";
import { guideSections } from "../src/lib/user-guide";

test("only appointed administrators may use private app feedback", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN"] as const) assert.equal(hasPermission(role, "app-feedback:manage"), true);
  for (const role of ["SHAREHOLDER", "FAMILY_MEMBER", "GUEST"] as const) assert.equal(hasPermission(role, "app-feedback:manage"), false);
});

test("feedback labels and guide anchors cover every supported option", () => {
  for (const status of feedbackStatuses) assert.ok(feedbackStatusLabels[status]);
  for (const category of feedbackCategories) assert.ok(feedbackCategoryLabels[category]);
  assert.equal(new Set(guideSections.map((section) => section.id)).size, guideSections.length);
  for (const section of guideSections) {
    assert.match(section.id, /^[a-z-]+$/);
    assert.ok(section.title && section.audience && section.intro && section.steps.length);
  }
});
