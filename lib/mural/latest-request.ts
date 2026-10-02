export function createLatestRequest<T>() {
  let latest = 0;
  return {
    async run(request: () => Promise<T>, success: (value: T) => void, error?: (error: unknown) => void, finished?: () => void) {
      const current = ++latest;
      try {
        const value = await request();
        if (current === latest) success(value);
      } catch (cause) {
        if (current === latest) error?.(cause);
      } finally {
        if (current === latest) finished?.();
      }
    },
    invalidate() { latest += 1; },
  };
}
