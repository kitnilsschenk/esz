-- V0065__baseline_beleg_externes_aktenzeichen.sql
--
-- TB-02: Der Baseline-Beleg als EXTERNER Verweis — Aktenzeichen, Ablageort
-- und Zahl der zugrunde liegenden Jahresabrechnungen.
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- Das Technische Merkblatt verlangt fuer das vereinfachte Messkonzept
-- ([Q3] Kap. 2.1.2, TB-02):
--
--   „mindestens Mittelwert aus den letzten drei Jahresabrechnungen des
--    Versorgers; bei weniger Abrechnungen ist eine Begruendung zu
--    dokumentieren."
--
-- Das Schema kennt seit V0002 `baseline_wert`, `baseline_methode` und
-- `baseline_begruendung` — die Begruendung traegt dort woertlich den
-- Kommentar „Pflicht wenn < 3 Jahresabrechnungen (TB-02)". Erzwungen war das
-- NIE, und zwar aus einem mechanischen Grund: Die ZAHL der Abrechnungen stand
-- nirgends. Ohne sie kann keine Regel wissen, ob die Begruendung faellig ist.
--
-- Ebenso fehlte der Verweis auf die Abrechnungen selbst. `baseline_beleg_ref`
-- ist seit V0002 als `uuid`-Slot fuer die spaetere Beleg-Ablage reserviert
-- („Slot, KEIN FK (Beleg-ADR)") — fuer ein externes Aktenzeichen ist ein
-- UUID der falsche Typ, und die Ablage selbst gibt es nicht.
--
-- =====================================================================
-- WARUM EXTERNER VERWEIS UND KEINE DOKUMENTENABLAGE
-- =====================================================================
-- Diese Migration folgt der Alternative, die ADR-0006 O4 selbst nennt: „v1
-- mit externem Aktenzeichen in `baseline_beleg_ref` betreiben". Der Grund ist
-- nicht Bequemlichkeit, sondern die Lage im Repo:
--
--   * ADR-0007 haelt fest, dass MinIO/S3 „im Dev-Stack bewusst nicht
--     enthalten" und ein Objektspeicher „ADR- und Security-Review-pflichtig"
--     ist; ADR-0004 verweist die Beleg-Ablage auf einen spaeteren ADR.
--   * Eine Jahresabrechnung ist ein Dokument voller Personendaten. Der
--     Krypto-Shred muesste sie erreichen — und fuer die Schluesselverwaltung
--     existiert bis heute NUR der Dev-Adapter (`key-management.port.ts`).
--     Eine PII-Dokumentenablage anzulegen, deren Loeschung an einem nicht
--     gebauten Adapter haengt, waere die schlechtere Halbfertigkeit.
--   * Der Objektspeicher-Standort ist Teil der offenen AVV-Frage
--     (AW-8/9/10, `compliance/dsgvo/avv-register.md`).
--
-- Der Verweis erfuellt, was TB-02 an DIESER Stelle verlangt: dass die
-- Baseline belegt und der Beleg auffindbar ist. Die Abrechnung bleibt dort,
-- wo sie ohnehin liegt.
--
-- =====================================================================
-- Die drei Spalten
-- =====================================================================
--   baseline_abrechnungen_anzahl -- Zahl der zugrunde liegenden
--       Jahresabrechnungen. Der fehlende Wert, an dem die TB-02-Regel bisher
--       nicht pruefbar war.
--   baseline_beleg_aktenzeichen  -- Die Kennung, unter der die Abrechnungen
--       ausserhalb des Systems gefuehrt werden.
--   baseline_beleg_ablageort     -- Wo das ist (Aktenordner, DMS, Laufwerk).
--       Getrennt vom Aktenzeichen, weil ein Umzug der Ablage das Aktenzeichen
--       nicht aendert — und umgekehrt.
--
-- `baseline_beleg_ref` bleibt UNVERAENDERT als reservierter uuid-Slot. Er
-- wird NICHT umgewidmet: Kaeme die Beleg-Ablage spaeter doch, braeuchte sie
-- genau diesen Slot, und ein zweckentfremdetes Feld waere dann im Weg.
--
-- =====================================================================
-- Die TB-02-Regel als DB-CHECK
-- =====================================================================
-- „Bei weniger als drei Abrechnungen ist eine Begruendung zu dokumentieren"
-- ist eine Auflage, kein Vorschlag — sie gehoert in die Datenbank und nicht
-- nur in eine Formularvalidierung, die ein zweiter Schreibpfad umgehen kann.
--
-- Der CHECK greift NUR, wenn die Anzahl ueberhaupt erfasst ist. Bestandszeilen
-- (Anzahl NULL) bleiben damit gueltig — sie sind nicht falsch, sondern
-- unvollstaendig, und eine Migration, die vorhandene Messkonzepte
-- rueckwirkend ungueltig macht, waere der falsche Weg, eine
-- Erfassungspflicht einzufuehren. Sobald jemand „2" eintraegt, ist die
-- Begruendung faellig — und zwar unausweichlich.

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD COLUMN baseline_abrechnungen_anzahl smallint,
    ADD COLUMN baseline_beleg_aktenzeichen  text,
    ADD COLUMN baseline_beleg_ablageort     text;

ALTER TABLE energy.messkonzept_version_energietraeger
    ADD CONSTRAINT ck_mvet_baseline_abrechnungen_anzahl
        CHECK (baseline_abrechnungen_anzahl IS NULL OR baseline_abrechnungen_anzahl >= 0),
    ADD CONSTRAINT ck_mvet_baseline_begruendung_bei_wenigen_abrechnungen
        CHECK (
            baseline_abrechnungen_anzahl IS NULL
         OR baseline_abrechnungen_anzahl >= 3
         OR (baseline_begruendung IS NOT NULL AND length(btrim(baseline_begruendung)) > 0)
        );

COMMENT ON CONSTRAINT ck_mvet_baseline_begruendung_bei_wenigen_abrechnungen ON energy.messkonzept_version_energietraeger IS
  'TB-02 ([Q3] Kap. 2.1.2): Bei weniger als drei Jahresabrechnungen ist eine Begruendung zu dokumentieren. Greift erst, sobald die Anzahl erfasst ist -- Bestandszeilen ohne Angabe bleiben gueltig (unvollstaendig, nicht falsch).';

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.baseline_abrechnungen_anzahl IS
  'pii=false; Zahl der Jahresabrechnungen, aus denen die Baseline gemittelt wurde (TB-02). Der Wert, an dem die Begruendungspflicht haengt.';

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.baseline_beleg_aktenzeichen IS
  'pii=indirekt; FREITEXT-Kennung, unter der die Jahresabrechnungen AUSSERHALB des Systems gefuehrt werden (ADR-0006 O4: "v1 mit externem Aktenzeichen betreiben"). Bewusst kein Dokument im System: eine Jahresabrechnung ist voller Personendaten, und der Krypto-Shred haengt an einem KMS, das nur als Dev-Adapter existiert. Der Text kann einen Namen enthalten, wenn der Betrieb so ablegt -- er verlaesst das System deshalb NICHT (nicht im BAFA-Export, nicht im Kundendokument).';

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.baseline_beleg_ablageort IS
  'pii=indirekt; FREITEXT: wo die Abrechnungen liegen (Aktenordner, DMS, Laufwerk). Getrennt vom Aktenzeichen, weil ein Umzug der Ablage das Aktenzeichen nicht aendert. Verlaesst das System NICHT.';

COMMENT ON COLUMN energy.messkonzept_version_energietraeger.baseline_beleg_ref IS
  'RESERVIERT und unbenutzt: uuid-Slot fuer die spaetere Beleg-Ablage (ADR-0004/ADR-0007, "spaeterer ADR"). Seit V0065 gibt es daneben den externen Verweis (baseline_beleg_aktenzeichen/-ablageort); dieser Slot wird dafuer BEWUSST NICHT umgewidmet -- kaeme die Ablage spaeter doch, braeuchte sie genau ihn.';
