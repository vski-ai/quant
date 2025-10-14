export function obfuscate(value: string) {
  if (value.length < 20) {
    return value;
  }
  const first = value.slice(0, 12);
  const last = value.slice(value.length - 8);
  const middle = "·".repeat(value.length - 20);
  return `${first}${middle}${last}`;
}
