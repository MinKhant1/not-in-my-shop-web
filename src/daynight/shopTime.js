const OPEN_MINUTE = 9 * 60;
const OPEN_HOURS = 12;

export function gameMinutesFromElapsed(elapsed, duration = 120) {
  const span = duration > 0 ? duration : 120;
  const progress = Math.min(1, Math.max(0, elapsed / span));
  return OPEN_MINUTE + progress * OPEN_HOURS * 60;
}

export function formatGameTime(gameMinutes) {
  const total = Math.max(0, gameMinutes);
  const hours24 = Math.min(23, Math.floor(total / 60));
  const mins = Math.floor(total % 60);
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) {
    hours12 = 12;
  }
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}
