import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './queryClient';

interface AppProvidersProps {
  readonly children: ReactNode;
}

/**
 * Bündelt alle App-weiten Provider: TanStack-Query-Client (Server-State)
 * + Router (Betriebs-UI-Routing, ADR-0008 §23 / D11, Phase 4c).
 * `BrowserRouter` liegt bewusst HIER (nicht erst in `App.tsx`), damit jeder
 * spätere Provider, der Router-Kontext braucht (z. B. künftige Nav-/Breadcrumb-
 * Provider), ihn ebenfalls vorfindet.
 */
export function AppProviders({ children }: AppProvidersProps): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
