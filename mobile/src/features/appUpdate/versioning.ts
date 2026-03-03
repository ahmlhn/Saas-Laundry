function normalizeVersionSegments(version: string): number[] {
  const segments = version.match(/\d+/g) ?? [];

  if (segments.length === 0) {
    return [0];
  }

  return segments.map((segment) => {
    const parsed = Number.parseInt(segment, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function compareAppVersions(left: string, right: string): number {
  const leftSegments = normalizeVersionSegments(left);
  const rightSegments = normalizeVersionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftSegments[index] ?? 0;
    const rightValue = rightSegments[index] ?? 0;

    if (leftValue === rightValue) {
      continue;
    }

    return leftValue > rightValue ? 1 : -1;
  }

  return 0;
}
