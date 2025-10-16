export const getMagnitude = (value: string) => parseInt(value.slice(0, -1));
export const getUnit = (value: string) => value.slice(-1);

export const getMilliseconds = (unit: string) => {
  switch (unit) {
    case "h":
      return 3600000;
    case "d":
      return 86400000;
    case "w":
      return 604800000;
    case "m":
      return 2592000000;
    default:
      return 0;
  }
};

export const calculateTimeRange = (period: string) => {
  if (period.startsWith("custom:")) {
    const [start, end] = period.replace("custom:", "").split("_");
    return { start, end };
  }
  const now = new Date();
  const magnitude = getMagnitude(period);
  const unit = getUnit(period);
  const start = new Date(now.getTime() - magnitude * getMilliseconds(unit));

  return { start: start.toISOString(), end: now.toISOString() };
};
