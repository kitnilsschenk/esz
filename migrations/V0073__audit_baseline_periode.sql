-- =====================================================================
-- V0073 -- Audit-Ereignis fuer die Baseline-Bezugszeitraeume
-- =====================================================================
--
-- WARUM
-- -----
-- `energy.baseline_periode` traegt die Zeitraeume, aus denen GTZ_base
-- hergeleitet wird: der Berechnungslauf bildet je Periode die
-- Gradtagzahl-Summe und nimmt deren MITTELWERT
-- (`berechnungslauf.service.ts`). Das ist der Nenner der
-- Witterungsbereinigung — er entscheidet mit, wie hoch die ausgewiesene
-- Einsparung ausfaellt.
--
-- Die Tabelle steht seit V0019 im Schema und war bis heute nur per SQL zu
-- fuellen: `AnalyticsBaselinePeriodeRepository` kann ausschliesslich LESEN.
-- Wer keine Periode erfassen konnte, hatte fuer GTZ_base nur den
-- `gtzBaseOverride` — also eine von Hand gesetzte Gradtagzahl. Genau dieser
-- Weg hat in diesem Projekt schon einmal zu einem falsch parametrierten
-- Bestand gefuehrt (geratene 3500 Kd/a).
--
-- Mit dem Erfassungsweg braucht es das Ereignis: Wer die Bezugszeitraeume
-- aendert, verschiebt rueckwirkend die Bezugsgroesse jeder kuenftigen
-- Rechnung.
--
-- KONTEXT-KEYS
-- ------------
-- `synthetic` (Pflicht-Tag, A9), `energietraeger`, `perioden_anzahl` und
-- `vorher_anzahl`. Die Anzahl ist die fachlich sprechende Groesse: TB-02
-- verlangt mindestens drei Jahresabrechnungen als Baseline-Grundlage, und
-- die Zahl der Perioden bildet das ab. KEINE Datumsangaben im Kontext --
-- sie stehen in der Tabelle, und der Eintrag soll die Aenderung belegen,
-- nicht den Inhalt duplizieren.
--
-- objekt_ref = mvet_id.
--
-- Review-Bedarf: `compliance-director` (Kontext-Keys), `baseline-engineer`.

INSERT INTO audit.event_typ (code)
VALUES ('messkonzept.baseline_periode.erfasst');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'messkonzept.baseline_periode.erfasst', 'messkonzept', 'erfassen',
     ARRAY['synthetic', 'energietraeger', 'perioden_anzahl', 'vorher_anzahl'],
     false, false, true,
     'Baseline-Bezugszeitraeume eines Messkonzept-Energietraegers gesetzt (BaselinePeriodeController.setzen). objekt_ref=mvet_id. Aus diesen Zeitraeumen bildet der Berechnungslauf GTZ_base als Mittelwert der Gradtagzahl-Summen je Periode -- den Nenner der Witterungsbereinigung. Ohne erfasste Periode bleibt nur der gtzBaseOverride, also eine von Hand gesetzte Gradtagzahl. kontext.perioden_anzahl spiegelt die TB-02-Erwartung (mindestens drei Jahresabrechnungen); Datumsangaben stehen bewusst NICHT im Kontext, sie gehoeren in die Tabelle.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s. V0006-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile:
-- Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
-- herstellen. Die Aenderung ist ueber die Migrationshistorie belegt.
