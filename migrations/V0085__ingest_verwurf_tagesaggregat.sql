-- V0085__ingest_verwurf_tagesaggregat.sql
--
-- Auflage C-6 (`compliance-director`-Votum 2026-09-16 zu ADR-0012 Stufe C):
-- Der Verwurf mangels Rechtsgrundlage muss ZAEHLBAR bleiben — dauerhaft,
-- nicht nur bis zum naechsten Neustart.
--
-- =====================================================================
-- WARUM DAS NOETIG IST
-- =====================================================================
-- A12-13 verlangt, dass ein Uplink ohne wirksame Rechtsgrundlage VERWORFEN
-- wird: keine Quarantaene-Zeile, kein Audit-Ereignis. Die Daten einer Person,
-- die widerrufen hat, in eine Tabelle mit offener Loeschfrist zu schreiben,
-- kehrte die Wirkung des Widerrufs um.
--
-- A12-14 verlangt im selben Atemzug, dass der Verwurf zaehlbar bleibt. Denn
-- sonst ist ein stiller TOTALAUSFALL des Gates — eine falsche Matrix, eine
-- kaputte Funktion, ein Fehler in der Subjekt-Aufloesung — nicht von
-- "niemand hat eingewilligt" zu unterscheiden. Beides sieht von aussen gleich
-- aus: Es kommt nichts an.
--
-- Bisher lebte dieser Zaehler ausschliesslich im Prozess
-- (`IngestMetricsService`, "einfacher In-Prozess-Zaehler", kein Exporter, im
-- Klassenkommentar selbst als spaetere Aufgabe vermerkt). Nach einem
-- Worker-Neustart war er weg. Das Votum nennt das ausdruecklich: "Zaehlbar
-- ist heute NICHT erfuellt."
--
-- =====================================================================
-- WARUM EINE TABELLE UND KEIN METRIK-EXPORT
-- =====================================================================
-- Das Votum liess beides zu ("dauerhaft exportiert ODER als subjektfreier
-- Tagesaggregat-Datensatz persistiert"). Es gibt in diesem Stand weder einen
-- `/metrics`-Endpunkt noch eine Metrik-Bibliothek; ein Exporter hiesse also
-- eine neue Abhaengigkeit plus eine Scrape-Infrastruktur, die es zu betreiben
-- gaebe. Die Tabelle kommt mit dem aus, was ohnehin laeuft.
--
-- =====================================================================
-- WARUM DAS KEIN WIDERSPRUCH ZU A12-13 IST
-- =====================================================================
-- Das ist die Stelle, an der man sich vertun kann: Hier entsteht doch eine
-- Datenbankzeile, obwohl A12-13 genau das verbieten wollte?
--
-- Nein — verboten ist eine Zeile, die das SUBJEKT weiterfuehrt. Diese Tabelle
-- traegt KEINE Zaehler-, Endkunden- oder Anschlussnutzer-Kennung, keinen
-- Messwert, keinen Zeitstempel unterhalb des Tages. Sie beantwortet genau
-- eine Frage: "Wie viele Uplinks wurden an Tag X aus Grund Y verworfen."
-- Daraus laesst sich keine Person rekonstruieren — auch nicht bei einem
-- einzigen Verwurf am Tag, weil die Zeile nicht sagt, WELCHER Zaehler.
--
-- Die Tagesaufloesung ist bewusst grob: Eine Minuten- oder Stundenaufloesung
-- waere in einer Anlage mit wenigen Zaehlern ein Zeitprofil, und ein
-- Zeitprofil ist ein Personenbezug auf Umwegen.

CREATE TABLE ingest.verwurf_tagesaggregat (
    tag          date        NOT NULL,
    grund        text        NOT NULL,
    anzahl       bigint      NOT NULL DEFAULT 0,
    erstmals_at  timestamptz NOT NULL DEFAULT now(),
    zuletzt_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_verwurf_tagesaggregat PRIMARY KEY (tag, grund),
    CONSTRAINT ck_verwurf_grund CHECK (grund IN ('rechtsgrundlage_fehlt')),
    CONSTRAINT ck_verwurf_anzahl CHECK (anzahl >= 0)
);

COMMENT ON TABLE ingest.verwurf_tagesaggregat IS
  'pii=false; Tagesgenaue, SUBJEKTFREIE Zaehlung verworfener Uplinks (ADR-0012 Stufe C, Auflage A12-14/C-6). KEINE Zaehler-/Endkunden-/Anschlussnutzer-Kennung, kein Messwert, keine Uhrzeit unterhalb des Tages -- die Tabelle beantwortet ausschliesslich "wie viele an Tag X aus Grund Y". Sie ist der Gegenpart zu A12-13 (Verwurf statt Quarantaene): Der Uplink verschwindet, aber nicht die Tatsache, DASS verworfen wurde -- sonst waere ein stiller Totalausfall des Gates nicht von "niemand hat eingewilligt" zu unterscheiden.';

COMMENT ON COLUMN ingest.verwurf_tagesaggregat.tag IS
  'pii=false; Kalendertag des Verwurfs (UTC). Bewusst GROB: Eine feinere Aufloesung waere in einer Anlage mit wenigen Zaehlern ein Zeitprofil, und ein Zeitprofil ist ein Personenbezug auf Umwegen.';

COMMENT ON COLUMN ingest.verwurf_tagesaggregat.grund IS
  'pii=false; Geschlossene Werteliste. Heute genau ein Grund -- Erweiterung nur per Migration, damit ein neuer Grund nicht beilaeufig entsteht und die Auswertung unbemerkt verschiebt.';

-- Der Worker zaehlt hoch: INSERT fuer den ersten Verwurf des Tages, UPDATE
-- (spaltenscharf) fuer jeden weiteren. SELECT braucht er, weil
-- `ON CONFLICT DO UPDATE SET anzahl = <tabelle>.anzahl + 1` den vorhandenen
-- Wert LIEST.
--
-- Kein DELETE: Die Zaehlung ist der Nachweis. Wer sie loeschen koennte,
-- koennte einen Totalausfall nachtraeglich unsichtbar machen -- und das ist
-- genau das Ereignis, dessentwegen es diese Tabelle gibt.
GRANT USAGE ON SCHEMA ingest TO edms_ingest_worker;
GRANT SELECT, INSERT ON ingest.verwurf_tagesaggregat TO edms_ingest_worker;
GRANT UPDATE (anzahl, zuletzt_at) ON ingest.verwurf_tagesaggregat TO edms_ingest_worker;

-- Die Betriebssicht liest mit. Kein Schreibrecht: Die Zahl entsteht im
-- Ingest-Pfad oder gar nicht.
GRANT SELECT ON ingest.verwurf_tagesaggregat TO edms_app;

-- =====================================================================
-- WAS DIESE MIGRATION NICHT LEISTET
-- =====================================================================
-- Die Auflage C-6 nennt zusaetzlich "Schwellwert-Alarmierung auf
-- Ratenaenderung". Eine Tabelle alarmiert nicht. Was sie leistet, ist die
-- VORAUSSETZUNG dafuer: eine Zahlenreihe, die einen Neustart ueberlebt und
-- gegen die sich eine Schwelle ueberhaupt definieren laesst.
--
-- Die Alarmierung selbst gehoert in die Betriebsueberwachung und ist als
-- solche zu bauen, wenn feststeht, womit dieser Bestand ueberwacht wird
-- (dieselbe offene Hoster-/Betriebsentscheidung wie beim KMS). Sie hier als
-- DB-Job vorwegzunehmen, hiesse eine Ueberwachung zu erfinden, die niemand
-- abliest -- das waere dieselbe Sorte Schein-Erfuellung wie ein
-- In-Prozess-Zaehler, der einen Neustart nicht ueberlebt.
