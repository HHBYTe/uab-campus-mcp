import { isSubjectKind, type CourseKind } from "./course-tools.js";

export type CourseGrade = {
  courseid: number;
  grade?: string;
  rawgrade?: string | null;
  rank?: number;
};

export type GradeCourseLabel = {
  shortname?: string | undefined;
  fullname?: string | undefined;
  kind: CourseKind;
};

/**
 * Attach course names and kind to each overview row. Rows whose course is not
 * in the enrolment list keep kind "unknown" and are always shown, so a failed
 * lookup never hides a grade.
 */
export function labelGradeOverview(
  grades: CourseGrade[],
  labels: Map<number, GradeCourseLabel>,
  includeNonSubjects: boolean,
) {
  const labelled = grades.map((grade) => {
    const label = labels.get(grade.courseid);
    return {
      ...grade,
      shortname: label?.shortname,
      fullname: label?.fullname,
      kind: label?.kind ?? ("unknown" as CourseKind),
    };
  });
  const shown = includeNonSubjects ? labelled : labelled.filter(({ kind }) => isSubjectKind(kind));
  return {
    grades: shown,
    ...(includeNonSubjects ? {} : { hiddenNonSubjectCount: labelled.length - shown.length }),
  };
}
