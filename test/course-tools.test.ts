import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCourseCategory,
  findCourseMatches,
  flattenCourseResources,
  isSubjectKind,
} from "../src/course-tools.js";

test("classifyCourseCategory separates subjects from UAB non-subject spaces", () => {
  assert.equal(classifyCourseCategory("Enginyeries"), "subject");
  assert.equal(classifyCourseCategory("Ciències"), "subject");
  assert.equal(classifyCourseCategory("Espais de comunicació"), "communication_space");
  assert.equal(classifyCourseCategory("ESPAIS DE COMUNICACIO "), "communication_space");
  assert.equal(classifyCourseCategory("Altres"), "other");
  assert.equal(classifyCourseCategory(undefined), "unknown");
  assert.equal(isSubjectKind("unknown"), true);
  assert.equal(isSubjectKind("communication_space"), false);
  assert.equal(isSubjectKind("other"), false);
});

test("findCourseMatches resolves IDs and accent-insensitive names", () => {
  const candidates = [
    { year: "2026-27", course: { id: 10, fullname: "Gestio de Dades", shortname: "MO100" } },
    { year: "2025-26", course: { id: 20, fullname: "Programacio Avancada", shortname: "MO200" } },
  ];

  assert.equal(findCourseMatches(candidates, "10", 10)[0]?.course.id, 10);
  assert.equal(findCourseMatches(candidates, "gestio dades", 10)[0]?.course.id, 10);
  assert.equal(findCourseMatches(candidates, "MO200", 10)[0]?.course.id, 20);
  assert.deepEqual(findCourseMatches(candidates, "physics", 10), []);
});

test("flattenCourseResources preserves section and file context", () => {
  const resources = flattenCourseResources([{
    id: 1,
    section: 2,
    name: "Week 2",
    modules: [{
      id: 30,
      instance: 40,
      name: "Slides",
      modname: "resource",
      url: "https://e-aules.uab.cat/example",
      contents: [{ filename: "slides.pdf", filesize: 123 }],
    }],
  }]);

  assert.deepEqual(resources, [{
    sectionId: 1,
    sectionNumber: 2,
    sectionName: "Week 2",
    moduleId: 30,
    instanceId: 40,
    name: "Slides",
    type: "resource",
    url: "https://e-aules.uab.cat/example",
    visible: undefined,
    availability: undefined,
    dates: undefined,
    files: [{ filename: "slides.pdf", filesize: 123, fileIndex: 0 }],
  }]);
});
