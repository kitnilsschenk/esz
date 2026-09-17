// Zentrale Query-Key-Factory für das Health-Feature (TanStack-Query-Konvention;
// Server-State nur über TanStack Query, .claude/rules/frontend-react.md).
export const healthKeys = {
  all: ['health'] as const,
  liveness: () => [...healthKeys.all, 'liveness'] as const,
  readiness: () => [...healthKeys.all, 'readiness'] as const,
};
