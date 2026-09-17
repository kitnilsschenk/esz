import { Module } from '@nestjs/common';
import { QuarantaeneRetentionService } from './quarantaene-retention.service';
import { QuarantaeneRetentionRepository } from './persistence/quarantaene-retention.repository';
import { MesswertVerdichtungService } from './messwert-verdichtung.service';
import { MesswertVerdichtungRepository } from './persistence/messwert-verdichtung.repository';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';

/**
 * ADR-0005 §25 / DSFA-0001 Element 12 a) — Retention ueber die
 * Ingest-Quarantaene.
 *
 * Eigener fachlicher Kontext, obwohl er zunaechst nur EINE Tabelle betraf: Die
 * uebrigen Loeschlaeufe (`analytics.*`, `einfluss.*`, `nachweis.*`,
 * Rohmesswerte) haengen an der F2-Arbeitsfrist und damit am
 * Zuwendungsbescheid; dieser hier nicht. Sie werden hier hinzukommen, sobald
 * A-O6 verifiziert ist — und dann gehoeren sie nebeneinander, nicht verstreut
 * in die jeweiligen Fach-Module.
 *
 * **Zugang 2026-09-07: die Verdichtung auf Tagesgranularitaet.** Das Votum
 * zu den User-Antworten hat die Ausfuehrungssperre neu gefasst — reversible
 * und datenmengenreduzierende Schritte sind frei, nur die physische Loeschung
 * bleibt bis zum Aktenvermerk AW-15 gesperrt. Die Verdichtung faellt in die
 * erste Gruppe und ist zugleich die VORBEDINGUNG der zweiten: Ohne
 * vollstaendigen Tagesbestand darf der Stufe-A-`drop_chunks` nicht laufen.
 *
 * Sie steht hier und nicht im Berechnungs-Modul, obwohl sie dessen
 * Rechenvorschrift spiegelt: Ihr Zweck ist die Aufbewahrungsbegrenzung, nicht
 * die Einsparermittlung. Wer sie im Berechnungs-Modul suchte, fande sie
 * spaeter an der Frist vorbei geaendert.
 */
@Module({
  providers: [
    QuarantaeneRetentionService,
    QuarantaeneRetentionRepository,
    MesswertVerdichtungService,
    MesswertVerdichtungRepository,
    // Liefert das Pflicht-Tag `kontext.synthetic` fuer die Audit-Zeile des
    // Quarantaene-Laufs. Eigene Provider-Zeile statt Modul-Import: Der Dienst
    // liest nur `process.env` und haelt keinen Zustand -- derselbe Zuschnitt
    // wie in `BerechnungModule`.
    SyntheticOnlyConfigService,
  ],
  exports: [QuarantaeneRetentionService, MesswertVerdichtungService],
})
export class RetentionModule {}
