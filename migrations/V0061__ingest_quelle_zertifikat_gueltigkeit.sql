-- V0061 — Ablaufdatum der hinterlegten Zertifikate (`ingest.quelle`, V0059)
--
-- WARUM
-- =====
-- Ein Client-Zertifikat laeuft ab. Passiert das unbemerkt, verweigert der
-- Broker die Verbindung, der Worker kommt nicht mehr durch — und niemand
-- erfaehrt es, bis jemand fehlende Messwerte bemerkt. Das ist dieselbe
-- Fehlerart, die diesem Modul schon zweimal gekostet hat, was es kostet:
-- eine Kette, die technisch „laeuft" und trotzdem nichts liefert.
--
-- ADR-0005 §17 verlangt fuer den produktiven Pfad ohnehin kurzlebige
-- Zertifikate (<= 90 Tage). Eine Gueltigkeit, die alle drei Monate endet,
-- MUSS sichtbar sein, sonst ist die Auflage eine Zeitbombe statt einer
-- Haertung.
--
-- WARUM EINE EIGENE SPALTE UND NICHT „BEI BEDARF AUS DEM PEM LESEN"
-- ================================================================
-- Das Zertifikat liegt verschluesselt. Um das Ablaufdatum anzuzeigen,
-- muesste die Anwendung es entschluesseln — fuer JEDE Quelle, bei JEDEM
-- Seitenaufruf, nur um eine Zahl zu erfahren. Das waere teuer und wuerde
-- Geheimnisse ohne Not durch den Speicher tragen. Das Ablaufdatum ist
-- ausserdem KEIN Geheimnis: Es steht im oeffentlichen Teil des Zertifikats,
-- und jeder, der die Verbindung sieht, kennt es.
--
-- Die Spalten sind NULLABLE und werden beim Einspielen aus dem PEM gelesen
-- (`node:crypto`-`X509Certificate`, keine zusaetzliche Abhaengigkeit). NULL
-- heisst „kein Zertifikat hinterlegt" — nicht „unbegrenzt gueltig".

BEGIN;

ALTER TABLE ingest.quelle
    ADD COLUMN ca_zertifikat_gueltig_bis     timestamptz,
    ADD COLUMN client_zertifikat_gueltig_bis timestamptz;

COMMENT ON COLUMN ingest.quelle.ca_zertifikat_gueltig_bis IS
    'notAfter des hinterlegten CA-Zertifikats, beim Einspielen aus dem PEM gelesen. NULL = kein Zertifikat hinterlegt (NICHT: unbegrenzt). Oeffentlicher Bestandteil des Zertifikats, daher unverschluesselt. pii=false.';
COMMENT ON COLUMN ingest.quelle.client_zertifikat_gueltig_bis IS
    'notAfter des hinterlegten Client-Zertifikats. Laeuft es ab, verweigert der Broker die Verbindung und die Datenaufnahme steht still — die Betriebssicht warnt daher vorher. pii=false.';

-- Ein Ablaufdatum ohne Zertifikat waere eine Aussage ueber nichts. Die
-- Umkehrung wird BEWUSST nicht erzwungen: Ein Zertifikat ohne lesbares
-- notAfter soll die Pflege nicht blockieren (dann steht die Spalte auf NULL
-- und die Betriebssicht sagt „unbekannt", statt die Eingabe abzuweisen).
ALTER TABLE ingest.quelle
    ADD CONSTRAINT ck_quelle_ca_gueltigkeit_braucht_zertifikat
        CHECK (ca_zertifikat_gueltig_bis IS NULL OR ca_zertifikat_enc IS NOT NULL),
    ADD CONSTRAINT ck_quelle_client_gueltigkeit_braucht_zertifikat
        CHECK (client_zertifikat_gueltig_bis IS NULL OR client_zertifikat_enc IS NOT NULL);

-- Fuer die Faellig-Abfrage der Betriebssicht („welche laufen demnaechst ab?").
-- Teilindex: Zeilen ohne Client-Zertifikat sind fuer diese Frage bedeutungslos.
CREATE INDEX ix_quelle_client_zertifikat_ablauf
    ON ingest.quelle (client_zertifikat_gueltig_bis)
    WHERE client_zertifikat_gueltig_bis IS NOT NULL;

COMMIT;
