export function toQueryBoolean(value: boolean | undefined): 1 | 0 | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }

  return value ? 1 : 0;
}
