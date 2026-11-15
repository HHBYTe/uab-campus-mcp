export type MoodlePrimitive = string | number | boolean;

export type MoodleValue =
  | MoodlePrimitive
  | null
  | undefined
  | MoodleValue[]
  | { [key: string]: MoodleValue };

export type MoodleParameters = Record<string, MoodleValue>;

export type AcademicYearToken = {
  baseUrl: string;
  token: string;
  privateToken?: string;
  createdAt?: string;
};

export type TokenFile = {
  version?: number;
  updatedAt?: string;
  years: Record<string, AcademicYearToken>;
};

export type SiteInfo = {
  userid: number;
  fullname?: string;
  username?: string;
  sitename?: string;
  siteurl?: string;
  functions?: Array<{ name: string; version?: string }>;
};

export type Course = {
  id: number;
  shortname?: string;
  fullname?: string;
  displayname?: string;
  startdate?: number;
  enddate?: number;
  visible?: number;
  progress?: number | null;
  category?: number;
};

export type CourseCategoryInfo = {
  id: number;
  categoryid?: number;
  categoryname?: string;
};

/** Raw Moodle calendar event (exporter or legacy shape); only the fields we read. */
export type CalendarEvent = {
  id: number;
  name?: string;
  description?: string | null;
  location?: string | null;
  modulename?: string | null;
  activityname?: string | null;
  instance?: number | null;
  eventtype?: string;
  timestart?: number;
  timeduration?: number;
  timesort?: number;
  overdue?: boolean;
  courseid?: number;
  course?: { id?: number; fullname?: string } | null;
  action?: { name?: string; url?: string; actionable?: boolean } | null;
  url?: string;
};

export type CourseModuleRef = {
  cmid: number;
  modname: string;
  instance: number;
};

/** Compact event returned by every calendar tool. */
export type CompactCalendarEvent = {
  id: number;
  name: string;
  activityname?: string | undefined;
  modulename?: string | undefined;
  eventtype?: string | undefined;
  timestart?: number | undefined;
  timeduration?: number | undefined;
  timesort?: number | undefined;
  overdue?: boolean | undefined;
  course?: { id: number; fullname?: string | undefined } | undefined;
  /** Course-module ID: use with campus_get_course_module and `/mod/<modulename>/view.php?id=`. */
  cmid?: number | undefined;
  /** Activity instance ID (e.g. the assignment or quiz ID used by activity tools). */
  instanceId?: number | undefined;
  assignmentId?: number | undefined;
  quizId?: number | undefined;
  location?: string | undefined;
  action?: { name?: string | undefined; actionable?: boolean | undefined; url?: string | undefined } | undefined;
  url?: string | undefined;
  description?: string | undefined;
};
