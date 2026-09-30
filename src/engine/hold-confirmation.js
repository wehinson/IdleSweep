export const DELETE_HOLD_MS = 4000;

export function createHoldConfirmation() {
  let armed = false;
  let startedAt = null;
  return {
    arm() { armed = true; },
    start(now) { if (armed && startedAt === null) startedAt = now; },
    cancel(disarm = false) { startedAt = null; if (disarm) armed = false; },
    snapshot(now) {
      const progress = startedAt === null ? 0 : Math.min(1, Math.max(0, (now - startedAt) / DELETE_HOLD_MS));
      return { armed, holding: startedAt !== null, progress, confirmed: armed && progress === 1 };
    },
  };
}
