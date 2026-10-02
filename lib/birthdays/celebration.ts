export const BIRTHDAY_CYCLE_MS = 120_000;
export const BIRTHDAY_BADGE_MS = 5_000;
export const BIRTHDAY_DANCE_MS = 3_000;

export function getCelebrationState(
  birthdayToday: boolean,
  sessionStartedAt: number,
  now: number,
): { visible: boolean; dancing: boolean } {
  if (!birthdayToday || !Number.isFinite(sessionStartedAt) || !Number.isFinite(now) || now < sessionStartedAt) {
    return { visible: false, dancing: false };
  }
  const elapsed = (now - sessionStartedAt) % BIRTHDAY_CYCLE_MS;
  return {
    visible: elapsed < BIRTHDAY_BADGE_MS,
    dancing: elapsed < BIRTHDAY_DANCE_MS,
  };
}
