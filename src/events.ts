import type { MoodleClient } from "./moodle-client.js";
import { decodeEntities, htmlToText } from "./text.js";
import type { CalendarEvent, CompactCalendarEvent, CourseModuleRef } from "./types.js";

/**
 * Moodle calendar events come in two shapes:
 *
 * - "exporter" events (core_calendar_get_action_events_by_*, core_calendar_get_calendar_event_by_id)
 *   carry a full `course` object and a module `url`. Their `instance` field is the
 *   course-module ID (cmid), not the activity instance ID.
 * - "legacy" events (core_calendar_get_calendar_events) carry `courseid` and the real
 *   activity instance ID in `instance`, but no cmid.
 *
 * `projectEvent` reduces both to one compact shape with explicit `cmid` and `instanceId`.
 */

const moduleViewUrl = /\/mod\/[a-z0-9_]+\/view\.php\?(?:[^#]*&)?id=(\d+)(?:[&#]|$)/i;

/** Extract the course-module ID from a Moodle activity URL such as `/mod/assign/view.php?id=55257`. */
export function parseCmidFromUrl(url: string | null | undefined): number | undefined {
  if (!url) return undefined;
  const match = moduleViewUrl.exec(url);
  if (!match?.[1]) return undefined;
  const cmid = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(cmid) && cmid > 0 ? cmid : undefined;
}

function isExporterEvent(event: CalendarEvent): boolean {
  return typeof event.url === "string" || (typeof event.course === "object" && event.course !== null);
}

function eventCourseId(event: CalendarEvent): number | undefined {
  const id = event.course?.id ?? event.courseid;
  return typeof id === "number" && id > 0 ? id : undefined;
}

/** Index of a course's modules: cmid → module, and `modname:instance` → cmid. */
export class ModuleIndex {
  private readonly byCmid = new Map<number, CourseModuleRef>();
  private readonly byInstance = new Map<string, number>();

  add(module: CourseModuleRef): void {
    this.byCmid.set(module.cmid, module);
    this.byInstance.set(`${module.modname}:${module.instance}`, module.cmid);
  }

  moduleFor(cmid: number): CourseModuleRef | undefined {
    return this.byCmid.get(cmid);
  }

  cmidFor(modname: string, instance: number): number | undefined {
    return this.byInstance.get(`${modname}:${instance}`);
  }
}

export type ProjectOptions = {
  includeDescription?: boolean;
  modules?: ModuleIndex;
};

/** Reduce a raw Moodle calendar event to the compact, read-only shape returned by every calendar tool. */
export function projectEvent(event: CalendarEvent, options: ProjectOptions = {}): CompactCalendarEvent {
  const modulename = event.modulename || undefined;
  let cmid: number | undefined;
  let instanceId: number | undefined;

  if (modulename) {
    if (isExporterEvent(event)) {
      cmid = parseCmidFromUrl(event.url) ?? parseCmidFromUrl(event.action?.url);
      const module = cmid === undefined ? undefined : options.modules?.moduleFor(cmid);
      if (module && module.modname === modulename) instanceId = module.instance;
    } else if (typeof event.instance === "number" && event.instance > 0) {
      instanceId = event.instance;
      cmid = options.modules?.cmidFor(modulename, event.instance);
    }
  }

  const courseId = eventCourseId(event);
  const projected: CompactCalendarEvent = {
    id: event.id,
    name: decodeEntities(event.name) ?? "",
    activityname: decodeEntities(event.activityname),
    modulename,
    eventtype: event.eventtype || undefined,
    timestart: event.timestart,
    timeduration: event.timeduration,
    timesort: event.timesort,
    overdue: event.overdue,
    course: courseId === undefined
      ? undefined
      : { id: courseId, fullname: decodeEntities(event.course?.fullname) },
    cmid,
    instanceId,
    assignmentId: modulename === "assign" ? instanceId : undefined,
    quizId: modulename === "quiz" ? instanceId : undefined,
    location: event.location ? decodeEntities(event.location) : undefined,
    action: event.action
      ? {
        name: decodeEntities(event.action.name),
        actionable: event.action.actionable,
        url: event.action.url,
      }
      : undefined,
    url: event.url,
  };
  if (options.includeDescription) projected.description = htmlToText(event.description);
  return projected;
}

type ContentsSection = { modules?: Array<{ id?: number; modname?: string; instance?: number }> };

/**
 * Build a module index for the courses referenced by module events, using one
 * `core_course_get_contents` call per distinct course. Failures are reported as
 * warnings; affected events simply lack `instanceId` (or `cmid` for legacy events).
 */
export async function indexEventModules(
  moodle: MoodleClient,
  year: string,
  events: CalendarEvent[],
): Promise<{ modules: ModuleIndex; warnings: string[] }> {
  const courseIds = [...new Set(events.flatMap((event) => {
    const id = event.modulename ? eventCourseId(event) : undefined;
    return id === undefined ? [] : [id];
  }))];
  const modules = new ModuleIndex();
  const warnings: string[] = [];
  await Promise.all(courseIds.map(async (courseId) => {
    try {
      const sections = await moodle.call<ContentsSection[]>(year, "core_course_get_contents", {
        courseid: courseId,
        options: [{ name: "excludecontents", value: true }],
      });
      for (const section of sections) {
        for (const module of section.modules ?? []) {
          if (typeof module.id === "number" && typeof module.instance === "number" && module.modname) {
            modules.add({ cmid: module.id, modname: module.modname, instance: module.instance });
          }
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not resolve activity IDs for course ${courseId}: ${reason}`);
    }
  }));
  return { modules, warnings };
}

/** Project a list of raw events, resolving cmid/instance IDs with bounded per-course lookups. */
export async function projectEvents(
  moodle: MoodleClient,
  year: string,
  events: CalendarEvent[],
  includeDescription: boolean,
): Promise<{ events: CompactCalendarEvent[]; warnings: string[] }> {
  const { modules, warnings } = await indexEventModules(moodle, year, events);
  return {
    events: events.map((event) => projectEvent(event, { includeDescription, modules })),
    warnings,
  };
}

/** Combine Moodle's own warnings with resolution warnings; omit the field when empty. */
export function mergeWarnings(moodleWarnings: unknown, extra: string[]): unknown[] | undefined {
  const all = [...(Array.isArray(moodleWarnings) ? moodleWarnings : []), ...extra];
  return all.length > 0 ? all : undefined;
}
