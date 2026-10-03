export const BIRTHDAY_BADGE_MS = 20_000;
export const BIRTHDAY_CYCLE_MS = BIRTHDAY_BADGE_MS + 120_000;
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

// Start only once the signal and model are actually available to this viewer.
export function getCharacterCelebrationState(starts: Map<string, number>, key: string, birthdayToday: boolean, now: number) {
  if (!birthdayToday) { starts.delete(key); return { visible: false, dancing: false }; }
  if (!starts.has(key)) starts.set(key, now);
  return getCelebrationState(true, starts.get(key)!, now);
}
