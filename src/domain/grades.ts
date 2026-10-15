import { CourseGradeRow } from '../types/domain';

export const DEFAULT_GRADE_SCALE: Record<string, number> = {
  O: 10,
  'A+': 9,
  A: 8,
  'B+': 7,
  B: 6,
  C: 5,
  P: 4,
  F: 0,
};

export interface SgpaCalculationResult {
  isValid: boolean;
  error?: string;
  totalCredits: number;
  weightedPoints: number;
  sgpa: number;
  projectedCgpa: number | null;
}

export function calculateSgpaAndCgpa(
  courses: CourseGradeRow[],
  gradeScale: Record<string, number> = DEFAULT_GRADE_SCALE,
  priorCgpa?: number,
  priorTotalCredits?: number
): SgpaCalculationResult {
  if (!courses.length) {
    return {
      isValid: false,
      error: 'Add at least one subject to calculate SGPA.',
      totalCredits: 0,
      weightedPoints: 0,
      sgpa: 0,
      projectedCgpa: null,
    };
  }

  let totalCredits = 0;
  let weightedPoints = 0;

  for (const row of courses) {
    if (!Number.isFinite(row.credits) || row.credits <= 0) {
      return {
        isValid: false,
        error: `Credits for "${row.name || 'unnamed subject'}" must be greater than 0.`,
        totalCredits: 0,
        weightedPoints: 0,
        sgpa: 0,
        projectedCgpa: null,
      };
    }
    const gp = gradeScale[row.gradeLetter];
    if (gp === undefined) {
      return {
        isValid: false,
        error: `Unknown grade "${row.gradeLetter}".`,
        totalCredits: 0,
        weightedPoints: 0,
        sgpa: 0,
        projectedCgpa: null,
      };
    }
    totalCredits += row.credits;
    weightedPoints += row.credits * gp;
  }

  const sgpa = Number((weightedPoints / totalCredits).toFixed(2));

  let projectedCgpa: number | null = null;
  if (
    priorCgpa !== undefined &&
    priorTotalCredits !== undefined &&
    Number.isFinite(priorCgpa) &&
    Number.isFinite(priorTotalCredits) &&
    priorTotalCredits > 0 &&
    priorCgpa >= 0 &&
    priorCgpa <= 10
  ) {
    const combinedPoints = priorCgpa * priorTotalCredits + weightedPoints;
    const combinedCredits = priorTotalCredits + totalCredits;
    projectedCgpa = Number((combinedPoints / combinedCredits).toFixed(2));
  }

  return {
    isValid: true,
    totalCredits,
    weightedPoints,
    sgpa,
    projectedCgpa,
  };
}
