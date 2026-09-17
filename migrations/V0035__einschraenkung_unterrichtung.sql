-- V0035__einschraenkung_unterrichtung.sql
--
-- ADR-Bezug: ADR-0007 Auflagen A11.7/A11.10 (compliance-director-Votum
-- 2026-08-26). Traegt den ERSTEN Schritt des Entsperr-Vorgangs: die nach
-- Art. 18 Abs. 3 DSGVO geschuldete Unterrichtung der betroffenen Person,
-- BEVOR die Einschraenkung aufgehoben wird.
--
-- =====================================================================
-- Warum eine Tabelle und nicht "einfach entsperren"
-- =====================================================================
-- Art. 18 Abs. 3 ist eine Ordnungsvorschrift MIT REIHENFOLGE: unterrichten,
-- dann aufheben. Ein einzelner Aufruf, der den Status zurueckflippt, kann
-- diese Reihenfolge weder herstellen noch belegen. Der Vorgang wird daher
-- zweistufig gebaut -- Muster `energy.endkunde_shred_antrag` (V0008/ADR-0009):
-- Schritt 1 dokumentiert, Schritt 2 prueft fail-closed gegen Schritt 1.
--
-- Warum nicht das Audit-Log als Beleg genuegt: es ist append-only Nachweis,
-- keine Steuerungsgrundlage. Die Anwendung wuerde sonst ihren eigenen
-- Kontrollzustand aus dem Protokoll lesen -- eine Kopplung, die den
-- Audit-Trail zur Geschaeftslogik macht und ihn damit aendernswert.
--
-- =====================================================================
-- Warum das Entsperren ueberhaupt gebaut wird
-- =====================================================================
-- Bis hierher war eine Art.-18-Sperre im EDMS eine EINBAHNSTRASSE (fuer
-- Endkunde wie Anschlussnutzer). Das ist kein fehlendes Komfort-Feature,
-- sondern rechtlich defizitaer:
--   * Art. 18 Abs. 1 lit. a und lit. d sind ihrem WORTLAUT nach BEFRISTET
--     ("fuer eine Dauer, die es dem Verantwortlichen ermoeglicht, die
--     Richtigkeit zu ueberpruefen" / "solange noch nicht feststeht"). Eine
--     Einschraenkung, die nach Wegfall des Grundes nicht aufhebbar ist,
--     entspricht nicht mehr der Rechtslage (auch Art. 5 Abs. 1 lit. e).
--   * Die Einschraenkung hat MATERIELLE NACHTEILE fuer die betroffene Person:
--     keine Nutzerinformation, keine Mehrwertdienste, bei 1b/1d Ausschluss
--     aus dem Nachweis. "Wir entsperren einfach nie" ist nicht die sichere
--     Variante, sondern die schaedliche.
--
-- =====================================================================
-- Bindung an GENAU DIESE Einschraenkung
-- =====================================================================
-- `gesperrt_seit` ist NICHT redundant: ohne diese Spalte wuerde eine
-- Unterrichtung aus einer FRUEHEREN Einschraenkung eine SPAETERE aufsperren
-- (Subjekte koennen mehrfach nacheinander eingeschraenkt werden -- 1a heute,
-- 1d in zwei Jahren). Der Aufhebungs-Pfad prueft daher auf Gleichheit mit
-- `energy.<subjekt>.gesperrt_seit`, nicht auf blosse Existenz einer Zeile.
--
-- Die Zeile bleibt nach der Aufhebung bestehen (append-only im Geiste): sie
-- ist der Beleg, dass unterrichtet wurde. Sie ist zugleich die einzige Stelle
-- ausserhalb des Audit-Logs, an der der Vorgang nach der Aufhebung noch
-- sichtbar ist -- in `energy.<subjekt>` wird jede Spur genullt
-- (Kohaerenz-CHECK V0024).
--
-- =====================================================================
-- Exklusiver Bogen statt polymorpher Spalte
-- =====================================================================
-- Zwei NULLBARE Fremdschluessel plus CHECK "genau einer gesetzt" statt einer
-- typlosen `subjekt_id` mit `subjekt_typ`-Diskriminator (Muster
-- `nachweis.export_pseudonym.entitaet_typ`). Begruendung: hier ist ECHTE
-- referenzielle Integritaet zu haben, und eine Waise waere bei einem
-- Betroffenenrechts-Vorgang besonders unangenehm -- ein Beleg, der auf
-- niemanden mehr zeigt, ist kein Beleg. Der Preis (eine Spalte mehr) ist
-- niedriger als der Verlust der DB-seitigen Garantie.
--
-- Der Krypto-Shred loescht die Subjekt-Zeilen NICHT (er neutralisiert nur
-- `identity.*`), die Fremdschluessel bleiben also gueltig.

CREATE TABLE energy.einschraenkung_unterrichtung (
    id                   uuid        PRIMARY KEY,        -- App: UUIDv7, KEIN DB-DEFAULT (Konvention V0002/V0003/V0008)
    endkunde_id          uuid        REFERENCES energy.endkunde(id),
    anschlussnutzer_id   uuid        REFERENCES energy.anschlussnutzer(id),
    gesperrt_seit        timestamptz NOT NULL,           -- bindet an GENAU die Einschraenkung, die aufgehoben werden soll
    unterrichtet_am      timestamptz NOT NULL DEFAULT now(),
    kanal                text        NOT NULL,           -- geschlossene Liste, s. CHECK
    unterrichtet_von_sub text        NOT NULL,           -- opaker Principal, KEIN FK (analog endkunde_shred_antrag.beantragt_von_sub)
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_einschr_unterrichtung_genau_ein_subjekt
        CHECK (num_nonnulls(endkunde_id, anschlussnutzer_id) = 1),
    -- GESCHLOSSENE Liste, KEIN Freitext: ein Freitextfeld wuerde binnen
    -- Wochen "Mail an frau.mueller@example.org" enthalten und damit PII in
    -- eine Tabelle tragen, die bewusst keine fuehrt (pii=false durchgehend).
    CONSTRAINT ck_einschr_unterrichtung_kanal
        CHECK (kanal IN ('postalisch', 'elektronisch', 'telefonisch', 'persoenlich'))
);

COMMENT ON TABLE energy.einschraenkung_unterrichtung IS
  'Art. 18 Abs. 3 DSGVO -- Nachweis der Unterrichtung VOR Aufhebung einer Verarbeitungseinschraenkung (ADR-0007 A11.7/A11.10). Schritt 1 des zweistufigen Entsperr-Vorgangs; Schritt 2 (Aufhebung) prueft fail-closed gegen diese Tabelle, gebunden ueber gesperrt_seit. Zeilen bleiben nach der Aufhebung bestehen -- sie sind der Beleg.';
COMMENT ON COLUMN energy.einschraenkung_unterrichtung.gesperrt_seit IS
  'Kopie von energy.<subjekt>.gesperrt_seit zum Zeitpunkt der Unterrichtung. Bindet den Beleg an GENAU diese Einschraenkung -- ohne sie wuerde eine Unterrichtung aus einer frueheren Einschraenkung eine spaetere aufsperren.';
COMMENT ON COLUMN energy.einschraenkung_unterrichtung.kanal IS
  'personenbeziehbar=false; geschlossene Liste (postalisch|elektronisch|telefonisch|persoenlich), bewusst KEIN Freitext -- sonst traegt die Spalte Kontaktdaten und damit PII.';
COMMENT ON COLUMN energy.einschraenkung_unterrichtung.unterrichtet_von_sub IS
  'personenbeziehbar=true; pii=false; art=opake-principal (kein FK); analog energy.endkunde_shred_antrag.beantragt_von_sub / audit.event.actor_sub; ADR-0007 A11.10.';

-- Hoechstens EINE Unterrichtung je Subjekt und Einschraenkung. Verhindert
-- Doppel-Dokumentation desselben Vorgangs und macht den fail-closed-Check in
-- Schritt 2 eindeutig (genau eine oder keine Zeile).
CREATE UNIQUE INDEX ux_einschr_unterrichtung_endkunde_je_sperre
    ON energy.einschraenkung_unterrichtung (endkunde_id, gesperrt_seit)
    WHERE endkunde_id IS NOT NULL;
CREATE UNIQUE INDEX ux_einschr_unterrichtung_anschlussnutzer_je_sperre
    ON energy.einschraenkung_unterrichtung (anschlussnutzer_id, gesperrt_seit)
    WHERE anschlussnutzer_id IS NOT NULL;

-- KEINE expliziten Grants -- bewusst, und gegen die Datenbank geprueft:
-- `energy.*` kennt dieses Modell nicht. Weder `energy.endkunde` noch
-- `energy.anschlussnutzer` noch `energy.endkunde_shred_antrag` (V0008, der
-- direkte Vorlaeufer dieser Tabelle) vergeben Rechte an `edms_app`; das
-- Schema gehoert `edms`, und die feingranularen Rollen-Grants existieren erst
-- in den spaeteren Schemata (`analytics`, `nachweis`, `einfluss`, `audit`).
-- Eine einzelne GRANT-Zeile hier wuerde ein Berechtigungsmodell suggerieren,
-- das es fuer `energy` nicht gibt -- und beim Aufbau eines solchen Modells
-- uebersehen werden, weil sie als "schon erledigt" aussieht.
--
-- Fachlich waere `SELECT, INSERT` das Richtige (der Beleg ist
-- unveraenderlich: eine Korrektur ist eine neue Unterrichtung zu einer neuen
-- Einschraenkung, kein UPDATE). Das ist beim `energy`-Grant-Zuschnitt
-- nachzuholen, nicht hier vorwegzunehmen.
