/** Parse Taskwarrior's compact UTC export timestamps without changing response fields. */
export function parseTaskwarriorDate(value: string): Date {
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (compact) {
    const [, year, month, day, hour, minute, second] = compact;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  // Preserve compatibility with extended ISO timestamps and invalid-date handling.
  return new Date(value);
}
