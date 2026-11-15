import type { Course } from "./types.js";

export type CourseSection = {
  id?: number;
  section?: number;
  name?: string;
  summary?: string;
  visible?: number;
  modules?: Array<Record<string, unknown>>;
};

export type CourseKind = "subject" | "communication_space" | "other" | "unknown";

// UAB files its non-academic Moodle spaces under these categories in every
// yearly instance (category IDs change per year, names do not). Everything
// else lives under a faculty category such as "Enginyeries" and is a subject.
const NON_SUBJECT_CATEGORIES: Record<string, CourseKind> = {
  "espais de comunicacio": "communication_space",
  altres: "other",
};

export function classifyCourseCategory(categoryName: string | undefined): CourseKind {
  const name = normalize(categoryName);
  if (!name) return "unknown";
  return NON_SUBJECT_CATEGORIES[name] ?? "subject";
}

/** Unknown categories are kept so a failed lookup never hides a real subject. */
export function isSubjectKind(kind: CourseKind): boolean {
  return kind === "subject" || kind === "unknown";
}

type CourseCandidate = {
  year: string;
  course: Course;
};

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
    : "";
}

function courseScore(course: Course, query: string): number {
  if (String(course.id) === query) return 100;
  const values = [course.shortname, course.fullname, course.displayname]
    .map(normalize)
    .filter(Boolean);
  if (values.some((value) => value === query)) return 90;
  if (values.some((value) => value.startsWith(query))) return 70;
  if (values.some((value) => value.includes(query))) return 50;
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.length > 1 && values.some((value) => terms.every((term) => value.includes(term)))
    ? 40
    : 0;
}

export function findCourseMatches(candidates: CourseCandidate[], query: string, limit: number) {
  const normalizedQuery = normalize(query);
  return candidates
    .map(({ year, course }) => ({ year, course, score: courseScore(course, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || normalize(left.course.fullname).localeCompare(normalize(right.course.fullname)))
    .slice(0, limit);
}

export function selectCourseContents(sections: CourseSection[], includeDescriptions: boolean) {
  return sections.map((section) => ({
    id: section.id,
    section: section.section,
    name: section.name,
    visible: section.visible,
    ...(includeDescriptions ? { summary: section.summary } : {}),
    modules: (section.modules ?? []).map((module) => ({
      id: module.id,
      name: module.name,
      modname: module.modname,
      modplural: module.modplural,
      instance: module.instance,
      url: module.url,
      visible: module.visible,
      availabilityinfo: module.availabilityinfo,
      dates: module.dates,
      contents: module.contents,
      ...(includeDescriptions ? { description: module.description } : {}),
    })),
  }));
}

export function flattenCourseResources(sections: CourseSection[]) {
  return sections.flatMap((section) => (section.modules ?? []).map((module) => ({
    sectionId: section.id,
    sectionNumber: section.section,
    sectionName: section.name,
    moduleId: module.id,
    instanceId: module.instance,
    name: module.name,
    type: module.modname,
    url: module.url,
    visible: module.visible,
    availability: module.availabilityinfo,
    dates: module.dates,
    files: Array.isArray(module.contents)
      ? module.contents.map((file, fileIndex) => ({ ...file, fileIndex }))
      : [],
  })));
}
