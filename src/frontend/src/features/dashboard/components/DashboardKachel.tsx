import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { cn } from '../../../shared/lib/cn';
import { t } from '../../../shared/i18n/t';

export type DashboardKachelTon = 'neutral' | 'kritisch' | 'warnung' | 'ok';

export interface DashboardKachelProps {
  readonly titel: string;
  readonly headingId: string;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ton: DashboardKachelTon;
  readonly wert: string;
  readonly beschreibung: string;
  readonly ctaLabel?: string;
  readonly ctaTo?: string;
}

const WERT_KLASSE_JE_TON: Readonly<Record<DashboardKachelTon, string>> = {
  neutral: 'text-foreground',
  ok: 'text-foreground',
  warnung: 'text-warning-foreground',
  kritisch: 'text-destructive-text',
};

const RAHMEN_KLASSE_JE_TON: Readonly<Record<DashboardKachelTon, string | undefined>> = {
  neutral: undefined,
  ok: undefined,
  warnung: 'border-warning',
  kritisch: 'border-destructive',
};

/**
 * Generische Dashboard-Kachel (Betriebs-UI-Konzept Punkt 1) — JEDE Kachel
 * lädt UNABHÄNGIG (eigener `isPending`/`isError`), ein einzelner langsamer
 * Endpunkt verzögert damit nie das gesamte Dashboard. `ton` steuert
 * ausschließlich die Akzentfarbe (Rahmen + Kennzahl) — die fachliche
 * Schwellenwert-Entscheidung (z. B. „rot wenn > 0") trifft der jeweilige
 * Aufrufer (`AusfallKachel`/`LueckenKachel`), NICHT diese Komponente.
 */
export function DashboardKachel(props: DashboardKachelProps): ReactNode {
  const { titel, headingId, isPending, isError, ton, wert, beschreibung, ctaLabel, ctaTo } = props;

  return (
    <Card className={cn(RAHMEN_KLASSE_JE_TON[ton])}>
      <CardHeader>
        <CardTitle id={headingId} as="h2">
          {titel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {t('stammdaten.common.laedt')}
          </p>
        )}
        {isError && (
          <p role="alert" className="text-sm font-medium text-destructive-text">
            {t('stammdaten.common.fehler')}
          </p>
        )}
        {!isPending && !isError && (
          <>
            <p className={cn('text-3xl font-bold', WERT_KLASSE_JE_TON[ton])}>{wert}</p>
            <p className="text-sm text-muted-foreground">{beschreibung}</p>
          </>
        )}
        {ctaTo !== undefined && ctaLabel !== undefined && (
          <p>
            <Link to={ctaTo} className="text-sm text-link underline-offset-4 hover:underline">
              {ctaLabel}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
