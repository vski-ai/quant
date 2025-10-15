export function formatColumnName(rawName: string): string {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const formatKey = (key: string) => {
    // Handles camelCase and snake_case
    return key.replace(/([A-Z])/g, " $1")
      .split("_")
      .map((word) => capitalize(word))
      .join(" ");
  };

  // Handle COMPOUND_SUM: amount_sum_by_country_US
  if (rawName.includes("_sum_by_")) {
    const parts = rawName.split("_sum_by_");
    const field = parts[0];
    const categoryParts = parts[1].split("_");
    const categoryKey = categoryParts[0];
    const categoryValue = categoryParts.slice(1).join("_");
    return `${formatKey(field)} (Sum) by ${
      formatKey(categoryKey)
    }: ${categoryValue}`;
  }

  // Handle CATEGORY: currency_by_USD
  if (rawName.includes("_by_")) {
    const parts = rawName.split("_by_");
    const key = parts[0];
    const value = parts.slice(1).join("_by_");
    return `${formatKey(key)}: ${value}`;
  }

  // Handle SUM: amount_sum
  if (rawName.endsWith("_sum")) {
    const key = rawName.replace("_sum", "");
    return `${formatKey(key)} (Sum)`;
  }

  // Handle COUNT: payment_succeeded_count
  if (rawName.endsWith("_count")) {
    const key = rawName.replace("_count", "");
    return `${formatKey(key)} (Count)`;
  }

  // Fallback for simple metrics: api_request_count
  return formatKey(rawName);
}
