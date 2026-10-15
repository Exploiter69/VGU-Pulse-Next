export interface AttendanceInput {
  attended: number;
  totalHeld: number;
  targetPercentage: number;
  simulateAttendNext?: number;
  simulateMissNext?: number;
}

export interface AttendanceResult {
  isValid: boolean;
  error?: string;
  currentPercentage: number;
  projectedPercentage: number;
  status: 'safe' | 'warning' | 'deficit';
  classesCanSkipSafely: number;
  classesMustAttendToRecover: number;
  summaryText: string;
}

export function calculateAttendance(input: AttendanceInput): AttendanceResult {
  const {
    attended,
    totalHeld,
    targetPercentage,
    simulateAttendNext = 0,
    simulateMissNext = 0,
  } = input;

  if (
    !Number.isFinite(attended) ||
    !Number.isFinite(totalHeld) ||
    !Number.isFinite(targetPercentage)
  ) {
    return {
      isValid: false,
      error: 'Please enter valid numbers.',
      currentPercentage: 0,
      projectedPercentage: 0,
      status: 'deficit',
      classesCanSkipSafely: 0,
      classesMustAttendToRecover: 0,
      summaryText: 'Invalid input.',
    };
  }

  if (attended < 0 || totalHeld < 0 || simulateAttendNext < 0 || simulateMissNext < 0) {
    return {
      isValid: false,
      error: 'Class counts cannot be negative.',
      currentPercentage: 0,
      projectedPercentage: 0,
      status: 'deficit',
      classesCanSkipSafely: 0,
      classesMustAttendToRecover: 0,
      summaryText: 'Class counts cannot be negative.',
    };
  }

  if (attended > totalHeld) {
    return {
      isValid: false,
      error: 'Attended classes cannot exceed total classes held.',
      currentPercentage: 0,
      projectedPercentage: 0,
      status: 'deficit',
      classesCanSkipSafely: 0,
      classesMustAttendToRecover: 0,
      summaryText: 'Check inputs: Attended > Held.',
    };
  }

  if (targetPercentage <= 0 || targetPercentage >= 100) {
    return {
      isValid: false,
      error: 'Target threshold must be between 1% and 99%.',
      currentPercentage: 0,
      projectedPercentage: 0,
      status: 'deficit',
      classesCanSkipSafely: 0,
      classesMustAttendToRecover: 0,
      summaryText: 'Target threshold must be between 1% and 99%.',
    };
  }

  if (totalHeld === 0) {
    return {
      isValid: true,
      currentPercentage: 100,
      projectedPercentage: 100,
      status: 'safe',
      classesCanSkipSafely: 0,
      classesMustAttendToRecover: 0,
      summaryText: 'No classes held yet. Enter your current lecture counts.',
    };
  }

  const targetRatio = targetPercentage / 100;
  const currentPercentage = Number(((attended / totalHeld) * 100).toFixed(2));

  const projectedAttended = attended + simulateAttendNext;
  const projectedTotal = totalHeld + simulateAttendNext + simulateMissNext;
  const projectedPercentage =
    projectedTotal > 0
      ? Number(((projectedAttended / projectedTotal) * 100).toFixed(2))
      : currentPercentage;

  let classesCanSkipSafely = 0;
  let classesMustAttendToRecover = 0;

  if (projectedPercentage >= targetPercentage) {
    classesCanSkipSafely = Math.max(
      0,
      Math.floor(projectedAttended / targetRatio - projectedTotal)
    );
  } else {
    classesMustAttendToRecover = Math.max(
      1,
      Math.ceil(
        (targetRatio * projectedTotal - projectedAttended) / (1 - targetRatio)
      )
    );
  }

  const status: 'safe' | 'warning' | 'deficit' =
    projectedPercentage >= targetPercentage + 3
      ? 'safe'
      : projectedPercentage >= targetPercentage
      ? 'warning'
      : 'deficit';

  const summaryText =
    projectedPercentage >= targetPercentage
      ? classesCanSkipSafely > 0
        ? `You can safely miss ${classesCanSkipSafely} upcoming ${
            classesCanSkipSafely === 1 ? 'class' : 'classes'
          } and stay at or above ${targetPercentage}%.`
        : `You are right on the ${targetPercentage}% boundary. Attending the next class builds a buffer.`
      : `Attend the next ${classesMustAttendToRecover} consecutive ${
          classesMustAttendToRecover === 1 ? 'class' : 'classes'
        } to reach ${targetPercentage}%.`;

  return {
    isValid: true,
    currentPercentage,
    projectedPercentage,
    status,
    classesCanSkipSafely,
    classesMustAttendToRecover,
    summaryText,
  };
}
