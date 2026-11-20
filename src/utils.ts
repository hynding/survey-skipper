/** Runtime null/undefined check that also guards input from untyped (JS or JSON) callers. */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
