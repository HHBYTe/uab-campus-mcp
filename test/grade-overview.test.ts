import assert from "node:assert/strict";
import test from "node:test";

import { labelGradeOverview, type GradeCourseLabel } from "../src/grade-overview.js";

const labels = new Map<number, GradeCourseLabel>([
  [10, { shortname: "GD", fullname: "Gestió de Dades", kind: "subject" }],
  [20, { shortname: "COORD", fullname: "Coordinació del grau", kind: "communication_space" }],
  [30, { shortname: "X", fullname: "Unresolved category", kind: "unknown" }],
]);
const grades = [
  { courseid: 10, grade: "8,50", rawgrade: "8.5" },
  { courseid: 20, grade: "-", rawgrade: null },
  { courseid: 30, grade: "7,00", rawgrade: "7" },
  { courseid: 40, grade: "6,00", rawgrade: "6" },
];

test("labelGradeOverview names rows and hides non-subject spaces by default", () => {
  const result = labelGradeOverview(grades, labels, false);
  assert.deepEqual(result.grades.map(({ courseid, kind }) => [courseid, kind]), [
    [10, "subject"],
    [30, "unknown"],
    [40, "unknown"],
  ]);
  assert.equal(result.grades[0]?.fullname, "Gestió de Dades");
  assert.equal(result.hiddenNonSubjectCount, 1);
});

test("labelGradeOverview keeps every row when non-subjects are requested", () => {
  const result = labelGradeOverview(grades, labels, true);
  assert.equal(result.grades.length, 4);
  assert.equal(result.grades[1]?.kind, "communication_space");
  assert.equal("hiddenNonSubjectCount" in result, false);
});
