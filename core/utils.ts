import { Granularity } from "./types.ts";

/**
 * Truncates a date to a specified granularity.
 * @param date The date to truncate.
 * @param granularity The unit to truncate to.
 * @returns A new Date object truncated to the specified granularity.
 */
export function truncateDate(
  date: Date,
  granularity: Granularity,
): Date {
  const d = new Date(date);

  if (granularity.endsWith("ms")) {
    const ms = parseInt(granularity.replace("ms", ""), 10);
    d.setUTCMilliseconds(Math.floor(d.getUTCMilliseconds() / ms) * ms);
  } else if (granularity === "second") {
    d.setUTCMilliseconds(0);
  } else if (granularity.endsWith("minute")) {
    // Reset smaller units first
    const minutes = parseInt(granularity.replace("minute", "") || "1", 10);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / minutes) * minutes, 0, 0);
  } else if (granularity.endsWith("hour")) {
    // Reset smaller units first
    const hours = parseInt(granularity.replace("hour", "") || "1", 10);
    d.setUTCHours(Math.floor(d.getUTCHours() / hours) * hours, 0, 0, 0);
  } else if (granularity.endsWith("day")) {
    const days = parseInt(granularity.replace("day", "") || "1", 10);
    d.setUTCHours(0, 0, 0, 0);
    if (days > 1) {
      // To truncate by multiple days, we can use epoch time arithmetic
      const dayMillis = 24 * 60 * 60 * 1000;
      const epoch = d.getTime();
      const truncatedEpoch = Math.floor(epoch / (days * dayMillis)) *
        (days * dayMillis);
      return new Date(truncatedEpoch);
    }
  }

  return d;
}
