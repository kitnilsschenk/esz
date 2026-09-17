import type { ReactNode } from 'react';
import type { Aufloesung } from '@edms/shared';
import type { VerbrauchTabellenZeileView } from '../../hooks/verbrauch';
import { formatiereBucket, formatiereWert } from '../../hooks/verbrauch';
import { cn } from '../../../../shared/lib/cn';
import { t } from '../../../../shared/i18n/t';

export interface VerbrauchTabelleProps {
  readonly caption: string;
  readonly zeilen: readonly VerbrauchTabellenZeileView[];
  readonly aufloesung: Aufloesung;
}

/**
 * Barrierefreie Tabellen-Alternative zum Balkendiagramm — TRÄGT DIESELBEN
 * DATEN (`.claude/rules/frontend-react.md`: Daten nie nur grafisch). Lücken
 * (`wert === undefined`) erscheinen als Text "Lücke", NIEMALS als `0`
 * (dieselbe Regel wie im Diagramm). Bewusst KEIN `DataList` (die Fabrik
 * bringt Lade-/Fehler-/Leer-/Paginierungs-Zustand mit, die hier bereits
 * EINMALIG auf Ebene der `VerbrauchAnsicht` behandelt werden — diese
 * Komponente bekommt nur bereits vollständig geladene Zeilen).
 */
export function VerbrauchTabelle(props: VerbrauchTabelleProps): ReactNode {
  const { caption, zeilen, aufloesung } = props;

  return (
    <div className="overflow-hidden overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground">{caption}</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium text-muted-foreground">
              {t('stammdaten.verbrauch.tabelle.zeitpunkt')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium text-muted-foreground">
              {t('stammdaten.verbrauch.tabelle.messgroesse')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium text-muted-foreground">
              {t('stammdaten.verbrauch.tabelle.einheit')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium text-muted-foreground">
              {t('stammdaten.verbrauch.tabelle.wert')}
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((zeile, index) => (
            <tr
              key={`${zeile.einheit}::${zeile.messgroesse}::${zeile.zeitpunkt}`}
              className={cn('border-b border-border transition-colors last:border-0', index % 2 === 1 && 'bg-muted/30')}
            >
              <td className="px-4 py-2 text-foreground">{formatiereBucket(zeile.zeitpunkt, aufloesung)}</td>
              <td className="px-4 py-2 text-foreground">{zeile.messgroesse}</td>
              <td className="px-4 py-2 text-foreground">{zeile.einheit}</td>
              <td className="px-4 py-2 text-foreground">
                {zeile.wert === undefined ? (
                  <span className="italic text-muted-foreground">{t('stammdaten.verbrauch.tabelle.luecke')}</span>
                ) : (
                  formatiereWert(zeile.wert)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
