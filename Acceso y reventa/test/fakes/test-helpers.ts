export function fixedClock(date: Date) {
  return { ahora: () => new Date(date) };
}

export function sequentialIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
