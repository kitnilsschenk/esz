import type { ReactNode } from 'react';
import { t } from '../shared/i18n/t';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';

/** Fallback für unbekannte Pfade (`<Route path="*">`). */
export function NotFoundPage(): ReactNode {
  useDocumentTitle(t('common.notFound'));

  return <p role="alert">{t('common.notFound')}</p>;
}
