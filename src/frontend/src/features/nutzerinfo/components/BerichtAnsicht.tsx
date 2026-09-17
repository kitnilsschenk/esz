import type { ReactNode } from 'react';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import type { NutzerinfoBerichtView } from '../hooks/useNutzerinfoBerichtView';

export interface BerichtAnsichtProps {
  readonly view: NutzerinfoBerichtView;
  /**
   * Der Weg vom Bericht zum Gegenstand — im Betrieb das Speichern des
   * Kundendokuments, im Portal der Druck. Er wird HEREINGEGEBEN, weil er die
   * einzige Stelle ist, an der sich die beiden Sichten unterscheiden: Der
   * Betrieb speichert eine Datei für den Versand, der Kunde druckt sein
   * eigenes Blatt.
   */
  readonly aktion?: ReactNode;
}

/**
 * Die Darstellung des Berichts — ohne Datenzugriff (TB-06, [Q3] Kap. 6).
 *
 * **Bis hierher hat das System die Zahlen gerechnet, eingefroren und gehasht —
 * aber nie jemandem gezeigt.** V0054 hält das selbst fest: „Erzeugen ist nicht
 * informieren." Diese Ansicht ist die Ausgabe, die die Auflage meint.
 *
 * Sie ist bewusst schlicht und ohne Betriebs-Vokabular gebaut: Sie ist die
 * Vorschau auf das, was ein Endkunde liest, und der soll darin weder
 * „Berechnungslauf" noch „Qualitätsstufe" entziffern müssen. Die
 * Betriebs-Angaben (Lauf-Kennung, Hash, Zustellweg) stehen in der
 * Verlaufs-Tabelle daneben, nicht hier.
 *
 * **Sie holt nichts.** Genau deshalb kann der Endkunde im Portal exakt
 * dieselbe Ansicht sehen wie die Vorschau des Betriebs, obwohl die Daten über
 * einen anderen Weg kommen (Sitzungs-Cookie statt Bearer). Eine zweite,
 * eigene Darstellung für den Kunden wäre die Stelle, an der die Auskunft an
 * die betroffene Person von der Betriebssicht abweicht.
 */
export function BerichtAnsicht({ view, aktion }: BerichtAnsichtProps): ReactNode {
  if (view.isPending) {
    return <p className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</p>;
  }
  if (view.isError) {
    return <StatusRegion ton="fehler" nachricht={view.ladeFehlerMeldung} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('nutzerinfo.bericht.titel')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {view.zeitraumLabel} · {view.energietraegerLabel}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p
            className={
              view.istMehrverbrauch ? 'text-xl font-semibold text-destructive-text' : 'text-xl font-semibold'
            }
          >
            {view.ergebnisLabel}
          </p>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">{t('nutzerinfo.bericht.verbrauchLabel')}</dt>
            <dd className="font-medium">{view.verbrauchLabel}</dd>
            <dt className="text-muted-foreground">{t('nutzerinfo.bericht.erwartungLabel')}</dt>
            <dd className="font-medium">{view.erwartungLabel}</dd>
            {view.vormonatLabel !== undefined && (
              <>
                <dt className="text-muted-foreground">{t('nutzerinfo.bericht.vormonatLabel')}</dt>
                <dd>{view.vormonatLabel}</dd>
              </>
            )}
            {view.zugestelltLabel !== undefined && (
              <>
                <dt className="text-muted-foreground">{t('nutzerinfo.bericht.zugestelltLabel')}</dt>
                <dd>{view.zugestelltLabel}</dd>
              </>
            )}
          </dl>

          {view.guteHinweis !== undefined && (
            <StatusRegion ton="hinweis" nachricht={view.guteHinweis} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('nutzerinfo.bericht.gruppenTitel')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('nutzerinfo.bericht.gruppenBeschreibung')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {view.gruppenLeerMeldung !== undefined && (
            <p className="text-sm text-muted-foreground">{view.gruppenLeerMeldung}</p>
          )}

          {view.gruppen.length > 0 && (
            <>
              <ul className="space-y-3">
                {view.gruppen.map((gruppe) => (
                  <li key={gruppe.id} className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{gruppe.bezeichnung}</span>
                      <span className="text-muted-foreground">
                        {gruppe.verbrauchLabel} · {gruppe.anteilLabel}
                      </span>
                    </div>
                    {/*
                      Der Balken ist Dekoration zur danebenstehenden Zahl und
                      traegt keine eigene Aussage — deshalb `aria-hidden`.
                      Eine Screenreader-Ansage „63 Prozent Fortschritt" waere
                      hier schlicht falsch.
                    */}
                    <div aria-hidden="true" className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${String(gruppe.anteilPct)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>

              <p className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
                <span className="text-muted-foreground">{t('nutzerinfo.bericht.nichtZugeordnetLabel')}</span>
                <span>{view.nichtZugeordnetLabel}</span>
              </p>
            </>
          )}

          <Badge variant="outline">{t('nutzerinfo.bericht.gruppenHinweis')}</Badge>
        </CardContent>
      </Card>

      {/*
        Der Weg von der Vorschau zum Gegenstand. Ohne ihn bliebe diese Ansicht
        eine Vorschau ohne Adressat.
      */}
      {aktion}
    </div>
  );
}
