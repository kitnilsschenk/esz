-- V0082__audit_tb03_erkennung_event_wrapper.sql
--
-- Teil 3 von 3 der V0079-Nachbesserung (`security-lead`-Review 2026-09-16):
-- die DOKUMENTATION. Teil 1 ist V0080 (Wrapper-Funktionen und Grant-Tausch),
-- Teil 2 ist V0081 (spaltenscharfes SELECT).
--
-- Warum drei Dateien statt einer: Die drei Aenderungen haben drei
-- verschiedene Pruef-Zustaendigkeiten und drei verschiedene Dringlichkeiten.
-- V0080 behebt einen High-Befund (`security-lead`), V0081 ist eine
-- Prinzipientreue-Korrektur ohne akutes Risiko, V0082 aendert kein Verhalten
-- und kein Schema. Wer eines davon zurueckbauen muss, soll die anderen
-- behalten koennen.
--
-- Diese Datei traegt den Namen der urspruenglich als EINE Migration
-- entworfenen Nachbesserung. Der Name ist nach der Aufteilung weiter
-- zutreffend -- alle drei Teile gehoeren zum selben Vorgang -- und wurde
-- bewusst nicht geaendert: `migrations/**` ist zustimmungspflichtig, und eine
-- Umbenennung waere eine Loeschung plus Neuanlage.
--
-- =====================================================================
-- (1) Die Wrapper-Funktionen selbst dokumentieren
-- =====================================================================
-- V0003 kommentiert seine SECURITY-DEFINER-Funktionen; V0080 hat das
-- nachzuholen versaeumt. Ein Grant, dessen Begruendung nur in einer
-- Migrationsdatei steht, ist fuer jemanden, der die Rechte-Lage in der
-- laufenden Datenbank prueft (`\df+ audit.*`), nicht auffindbar.
-- =====================================================================

COMMENT ON FUNCTION audit.append_tb03_einsicht_event(integer, boolean) IS
  'ADR-0006 A19a. Schreibt GENAU das Ereignis einflussgroesse.stammdaten.einsicht -- event_typ, actor_typ=system und actor_sub=tb03-erkennung-runner sind im Funktionskoerper fest verdrahtet, nicht Parameter. Existiert, damit edms_einfluss_erkennung KEIN EXECUTE auf die generische audit.append_event braucht: PostgreSQL kennt keine argumentscharfen GRANTs, ein Grant darauf erlaubte jeden Event-Typ mit frei gewaehltem actor_sub (security-lead-Review zu V0079, behoben in V0080).';

COMMENT ON FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean) IS
  'ADR-0006 A19b/A23. Schreibt GENAU das Ereignis einflussgroesse.schwellwert.ueberschritten, ein Ereignis je tatsaechlich geschriebenem Befund. event_typ, actor_typ=system, actor_sub=tb03-erkennung-runner und ergebnis=ok sind fest verdrahtet; die uebrigen Parameter bilden exakt die Kontext-Whitelist aus V0021 (12) ab. p_ueberschreitung_klasse wird gegen die drei Werte des CHECK auf einfluss.befund geprueft -- ein zweiter, bewusst redundanter Fail-Closed, weil dieser Wert als einziger nicht verdrahtet werden kann. Herkunft: security-lead-Review zu V0079 (V0080).';

-- =====================================================================
-- (2) Semantik von `zeitraum_bis`
-- =====================================================================
-- Zweiter, kleinerer Punkt aus demselben Review. Die Spalte traegt "Monat, ab
-- dem die Anzeigepflicht entsteht", NICHT "Ende des ausloesenden Zustands" --
-- bislang stand das nur im TS-Docstring von `erkenneTb03()`
-- (`domain/tb03-erkennung.ts`). Weder die Spalte noch der OpenAPI-Vertrag
-- sagten einem Konsumenten, dass "bis" hier etwas anderes bedeutet als
-- ueblich.
--
-- Bei einem OFFENEN Intervall (dauerhafter Belegungswechsel ohne bekanntes
-- Enddatum) besteht die Lage ueber diesen Monat hinaus fort. Wer das Feld als
-- "Ende" liest, meldete der Bewilligungsbehoerde ein Ende, das nie eintrat --
-- und `einfluss.befund` ist append-only (V0020, kein UPDATE/DELETE), also
-- nicht nachtraeglich korrigierbar.
--
-- Die Berechnung selbst (B12.5, A15/A23) ist richtig und bleibt unveraendert:
-- Sie MUSS sich allein aus den Intervalldaten ergeben, nie aus dem Laufdatum,
-- sonst traegt der Idempotenz-Index aus A23 nicht. Dies ist eine reine
-- Dokumentationsnachbesserung, kein Verhaltens-, kein Schema-Change.
-- =====================================================================

COMMENT ON COLUMN einfluss.befund.zeitraum_bis IS
  'pii=false; Monat, AB DEM die TB-03-Anzeigepflicht entsteht (Beginn der Aenderung + Mindestdauer, B12.5) -- NICHT das Ende des ausloesenden Zustands. Bei offenen Intervallen (z. B. dauerhafter Belegungswechsel ohne bekanntes Enddatum) besteht die Lage ueber diesen Monat hinaus fort. einfluss.befund ist append-only (V0020, kein UPDATE/DELETE) -- eine Lesung als Ende der Lage ist nicht nachtraeglich korrigierbar. Herkunft: security-lead-Review zu V0079 (V0082).';
