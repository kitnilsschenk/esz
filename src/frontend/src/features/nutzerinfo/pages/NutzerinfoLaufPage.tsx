import type { ReactNode } from 'react';
import { PageHeader } from '../../stammdaten/components/shared';
import { NutzerinfoLaufPanel } from '../components/NutzerinfoLaufPanel';
import { NutzerinfoVersandPanel } from '../components/NutzerinfoVersandPanel';
import { t } from '../../../shared/i18n/t';

/**
 * Route-Container `/nutzerinfo/laeufe` — die monatliche Nutzerinformation
 * anstossen (TB-06).
 *
 * Keine Liste vergangener Laeufe: Die API bietet keine, und das ist kein
 * Versehen. Ein Lauf ist ein Vorgang, dessen Ergebnis in den erzeugten
 * Informationen steht — die sieht man am Endkunden. Was von einem Lauf
 * bleibt, ist die Audit-Zeile.
 *
 * Die Seite traegt BEIDE Halbschritte der Auflage: erzeugen (oben) und
 * zustellen (unten). V0054 haelt fest, warum das zusammengehoert —
 * „Erzeugen ist nicht informieren"; eine Seite, die nur die eine Haelfte
 * anbietet, laesst die Auflage unerfuellt aussehen wie erledigt.
 */
export function NutzerinfoLaufPage(): ReactNode {
  return (
    <section aria-labelledby="nutzerinfo-lauf-heading">
      <PageHeader headingId="nutzerinfo-lauf-heading" title={t('nutzerinfo.lauf.pageTitle')} />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('nutzerinfo.lauf.pageEinfuehrung')}</p>
        <NutzerinfoLaufPanel />
        {/*
          Der zweite Halbschritt derselben Auflage: erzeugen UND zustellen.
          Er steht bewusst hier und nicht auf einer eigenen Seite — wer den
          Lauf gerade ausgefuehrt hat, ist genau die Person, die als
          Naechstes versendet.
        */}
        <NutzerinfoVersandPanel />
        {/*
          Wegweiser statt Sackgasse: Diese Seite stoesst den Lauf an, zeigt
          aber keinen einzigen Bericht — die stehen am Endkunden. Ohne den
          Hinweis endet die Bedienfolge hier mit einer Zahl und ohne Weg
          dorthin, wo man das Ergebnis tatsaechlich ansieht.
        */}
        <p className="text-sm text-muted-foreground">{t('nutzerinfo.lauf.woFindeIch')}</p>
      </div>
    </section>
  );
}

export default NutzerinfoLaufPage;
