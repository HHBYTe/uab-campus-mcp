import assert from "node:assert/strict";
import test from "node:test";

import { indexEventModules, mergeWarnings, ModuleIndex, parseCmidFromUrl, projectEvent } from "../src/events.js";
import type { MoodleClient } from "../src/moodle-client.js";
import type { CalendarEvent } from "../src/types.js";

const base = "https://campus.example.test/2026-27";

function modules() {
  const index = new ModuleIndex();
  index.add({ cmid: 55257, modname: "assign", instance: 6146 });
  index.add({ cmid: 93648, modname: "quiz", instance: 4041 });
  return index;
}

const exporterEvent: CalendarEvent & Record<string, unknown> = {
  id: 16180,
  name: "Venciment de Costs &amp; Benefits",
  description: "<p>Submit the <strong>report</strong>.</p><img src=\"x.png\">",
  modulename: "assign",
  activityname: "Costs &amp; Benefits",
  instance: 55257,
  eventtype: "due",
  timestart: 1794956340,
  timeduration: 0,
  timesort: 1794956340,
  overdue: false,
  location: "",
  course: { id: 1071, fullname: "Parallel &amp; Distributed", courseimage: "data:image/svg+xml;base64,AAAA" } as never,
  icon: { iconurl: `${base}/icon.svg` },
  editurl: `${base}/course/mod.php?update=55257&sesskey=abc`,
  deleteurl: `${base}/calendar/delete.php?id=16180`,
  formattedtime: "<a href=\"#\">Tomorrow</a>",
  subscription: { displayeventsource: false },
  action: { name: "Add submission", url: `${base}/mod/assign/view.php?id=55257&action=editsubmission`, actionable: true },
  url: `${base}/mod/assign/view.php?id=55257`,
};

test("parseCmidFromUrl extracts the course-module ID from activity URLs", () => {
  assert.equal(parseCmidFromUrl(`${base}/mod/assign/view.php?id=55257`), 55257);
  assert.equal(parseCmidFromUrl(`${base}/mod/assign/view.php?id=55257&action=editsubmission`), 55257);
  assert.equal(parseCmidFromUrl(`${base}/mod/quiz/view.php?foo=1&id=93648#top`), 93648);
  assert.equal(parseCmidFromUrl(`${base}/mod/assign/view.php?cmid=5`), undefined);
  assert.equal(parseCmidFromUrl(`${base}/calendar/view.php?id=5`), undefined);
  assert.equal(parseCmidFromUrl(`${base}/mod/assign/view.php?id=12abc`), undefined);
  assert.equal(parseCmidFromUrl(undefined), undefined);
});

test("projectEvent maps exporter events to cmid and the real instance ID", () => {
  const projected = projectEvent(exporterEvent, { modules: modules() });
  assert.deepEqual(projected, {
    id: 16180,
    name: "Venciment de Costs & Benefits",
    activityname: "Costs & Benefits",
    modulename: "assign",
    eventtype: "due",
    timestart: 1794956340,
    timeduration: 0,
    timesort: 1794956340,
    overdue: false,
    course: { id: 1071, fullname: "Parallel & Distributed" },
    cmid: 55257,
    instanceId: 6146,
    assignmentId: 6146,
    quizId: undefined,
    location: undefined,
    action: {
      name: "Add submission",
      actionable: true,
      url: `${base}/mod/assign/view.php?id=55257&action=editsubmission`,
    },
    url: `${base}/mod/assign/view.php?id=55257`,
  });
  const serialized = JSON.stringify(projected);
  for (const dropped of ["courseimage", "editurl", "deleteurl", "sesskey", "icon", "formattedtime", "subscription"]) {
    assert.ok(!serialized.includes(dropped), `${dropped} should be dropped`);
  }
});

test("projectEvent includes plain-text descriptions only on request", () => {
  assert.equal(projectEvent(exporterEvent).description, undefined);
  assert.equal(projectEvent(exporterEvent, { includeDescription: true }).description, "Submit the report.");
});

test("projectEvent never reports the cmid as an instance ID when it cannot resolve", () => {
  const projected = projectEvent(exporterEvent, { modules: new ModuleIndex() });
  assert.equal(projected.cmid, 55257);
  assert.equal(projected.instanceId, undefined);
  assert.equal(projected.assignmentId, undefined);
});

test("projectEvent keeps legacy instance IDs and resolves their cmid", () => {
  const legacy: CalendarEvent = {
    id: 26499,
    name: "Unit 2 closes",
    courseid: 1955,
    modulename: "quiz",
    instance: 4041,
    eventtype: "close",
    timestart: 1735685940,
    timeduration: 0,
  };
  const projected = projectEvent(legacy, { modules: modules() });
  assert.equal(projected.instanceId, 4041);
  assert.equal(projected.quizId, 4041);
  assert.equal(projected.cmid, 93648);
  assert.deepEqual(projected.course, { id: 1955, fullname: undefined });
  assert.equal(projectEvent(legacy).cmid, undefined);
  assert.equal(projectEvent(legacy).instanceId, 4041);
});

test("projectEvent leaves site and user events without module IDs", () => {
  const projected = projectEvent({ id: 7, name: "Holiday", eventtype: "site", courseid: 1, instance: 0 });
  assert.equal(projected.cmid, undefined);
  assert.equal(projected.instanceId, undefined);
});

test("indexEventModules makes one contents call per course and reports failures as warnings", async () => {
  const calls: number[] = [];
  const moodle = {
    async call(_year: string, functionName: string, parameters: { courseid: number }) {
      assert.equal(functionName, "core_course_get_contents");
      calls.push(parameters.courseid);
      if (parameters.courseid === 2) throw new Error("requireloginerror");
      return [{ modules: [{ id: 55257, modname: "assign", instance: 6146 }, { id: 9, modname: "label" }] }];
    },
  } as unknown as MoodleClient;
  const events: CalendarEvent[] = [
    { ...exporterEvent },
    { ...exporterEvent, id: 2 },
    { id: 3, courseid: 2, modulename: "quiz", instance: 1 },
    { id: 4, courseid: 3, eventtype: "course" },
  ];
  const { modules: index, warnings } = await indexEventModules(moodle, "2026-27", events);
  assert.deepEqual(calls.sort(), [1071, 2]);
  assert.equal(index.moduleFor(55257)?.instance, 6146);
  assert.equal(index.moduleFor(9), undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /course 2: requireloginerror/);
});

test("mergeWarnings omits empty warning lists", () => {
  assert.equal(mergeWarnings([], []), undefined);
  assert.equal(mergeWarnings(undefined, []), undefined);
  assert.deepEqual(mergeWarnings([{ item: "x" }], ["y"]), [{ item: "x" }, "y"]);
});
