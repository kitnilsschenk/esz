// Zentrale Query-Key-Factory für das Auth-Feature (TanStack-Query-Konvention;
// Server-State nur über TanStack Query, .claude/rules/frontend-react.md).
export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
};
