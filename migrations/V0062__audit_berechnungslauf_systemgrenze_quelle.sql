-- V0062__audit_berechnungslauf_systemgrenze_quelle.sql
--
-- Erweitert die Kontext-Whitelist von
-- `berechnungslauf.bereinigung.abgeschlossen` um GENAU EINEN Schluessel:
-- `systemgrenze_quelle`.
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- Die Zaehler-Menge eines Laufs wurde bis hierher ueber "alle aktiven Zaehler
-- des Endkunden mit passendem Energietraeger" bestimmt -- eine Heuristik aus
-- der Zeit vor V0028, als das Schema keine Bindung `mvet -> System` kannte.
-- Ein Endkunde mit ZWEI unabhaengigen Gas-Messkonzepten bekam damit in BEIDEN
-- Laeufen die Summe BEIDER Systeme; jedes Messkonzept wies den Verbrauch des
-- anderen mit aus, und die daraus abgeleitete Einsparung ging so in den
-- Nachweis an die Bewilligungsbehoerde.
--
-- Seit V0028 ist die Zuordnung `messkonzept_version_energietraeger_system`
-- massgeblich. Ihr Tabellenkommentar sieht ausdruecklich einen
-- Uebergangszustand vor ("Tabelle startet LEER"): Ein `mvet` OHNE Zuordnung
-- muss weiter rechnen koennen, sonst braeche jeder Bestandslauf. Damit gibt es
-- zwei Wege zur selben Zahl -- und der Unterschied ist fachlich erheblich.
-- `systemgrenze_quelle` haelt fest, welcher gegriffen hat:
--
--   'mvet_system'       -- Regelweg, ueber die V0028-Zuordnung aufgeloest.
--   'endkunde_fallback' -- keine Zuordnung gepflegt, kundenweite Heuristik.
--
-- Ohne diesen Schluessel ist einem abgeschlossenen Lauf NICHT anzusehen, ob
-- seine Systemgrenze gesetzt oder geraten war. Genau das ist die Angabe, die
-- ein Pruefer braucht, um einen Ist-Verbrauch zu beurteilen.
--
-- =====================================================================
-- Grenzen dieser Erweiterung
-- =====================================================================
-- EIN Schluessel, geschlossene Wertemenge (zwei Werte), kein Personenbezug,
-- KEIN Wert-Key (kWh/Temperatur/GTZ/Baseline) -- die A9-Auflage aus der
-- V0021-Beschreibung bleibt unberuehrt. Auch KEINE System-IDs: die Frage ist
-- "woher stammt die Menge", nicht "welche Systeme waren es" (die stehen ueber
-- `lauf_id` ohnehin an den Snapshot-Zeilen).
--
-- Nur `...abgeschlossen` bekommt den Schluessel. `...angefordert` wird VOR der
-- Aufloesung emittiert und kann die Quelle nicht kennen; `...fehlgeschlagen`
-- traegt bereits `fehler_code`, und ein Lauf, der nicht zustande kam, hat
-- keine ausgewiesene Systemgrenze.
--
-- =====================================================================
-- SCD2 statt UPDATE
-- =====================================================================
-- Die bestehende V0021-Zeile wird NICHT editiert -- historische Events muessen
-- weiter gegen die Version aufloesbar bleiben, unter der sie gesiegelt wurden.
-- Muster exakt wie V0009/V0032: alte Zeile `gueltig_bis`, neue Zeile mit
-- erweitertem Array, kein neuer `audit.event_typ`-Header. Die neue Zeile wird
-- aus der Vorgaenger-Zeile ABGELEITET (`array_append(erlaubte_kontext_keys,
-- ...)`, NICHT `|| 'literal'` -- der Operator liest den String dann als
-- Array-Literal und scheitert mit "malformed array literal"), nicht
-- abgetippt -- ein abgeschriebenes Array wuerde bei jeder kuenftigen
-- Katalog-Aenderung still auseinanderlaufen.
--
-- LAST-BEARING ANNAHME (wie V0009/V0032): `now()` ist innerhalb EINER
-- Transaktion stabil (Transaktions-Startzeit) -- UPDATE und INSERT laufen in
-- EINER Transaktion (Standardverhalten des Migrations-Runners je Datei). Nur
-- so gilt exakt `alte_version.gueltig_bis = neue_version.gueltig_ab`; die
-- Down-Datei nutzt diese Gleichheit, um die neue Version zu erkennen.

DO $$
DECLARE
    v_code text := 'berechnungslauf.bereinigung.abgeschlossen';
    v_alt  audit.event_typ_version%ROWTYPE;
BEGIN
    SELECT * INTO v_alt
      FROM audit.event_typ_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY gueltig_ab DESC
     LIMIT 1;

    IF v_alt.id IS NULL THEN
        RAISE EXCEPTION 'audit: keine offene (gueltig_bis IS NULL) Version fuer % -- Katalog in unerwartetem Zustand, Migration abgebrochen.', v_code;
    END IF;

    IF 'systemgrenze_quelle' = ANY (v_alt.erlaubte_kontext_keys) THEN
        RAISE EXCEPTION 'audit: systemgrenze_quelle steht bereits in der Whitelist von % -- Migration abgebrochen (doppelte Anwendung?).', v_code;
    END IF;

    UPDATE audit.event_typ_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO audit.event_typ_version
        (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
         rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
    VALUES
        (gen_random_uuid(), v_code, v_alt.objekt_typ, v_alt.aktion_kategorie,
         array_append(v_alt.erlaubte_kontext_keys, 'systemgrenze_quelle'),
         v_alt.rolle_erfassen, v_alt.pflichtereignis, v_alt.aktiv,
         v_alt.beschreibung || ' NEU (V0062): kontext.systemgrenze_quelle = woher die Zaehler-Menge dieses Laufs stammt -- mvet_system (ueber die V0028-Zuordnung messkonzept_version_energietraeger_system aufgeloest, Regelweg) oder endkunde_fallback (fuer diese mvet ist KEINE Zuordnung gepflegt; der Lauf hat auf alle aktiven Zaehler des Endkunden mit passendem Energietraeger zurueckgegriffen -- bei mehreren Messkonzepten desselben Kunden fliesst dabei fremder Verbrauch ein). Geschlossene Wertemenge, kein Personenbezug, kein Wert-Key (A9 unberuehrt). Serviceseitig gesetzt in BerechnungslaufService.berechnenUndSpeichernInTx, Typ SystemgrenzeQuelle.',
         now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s.
-- V0006/V0007/V0009/V0015/V0021/V0026/V0032-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile. Der
-- tragende Grund ist unveraendert mechanisch: ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen -- eine Selbst-Emission
-- muesste einen Akteur erfinden, genau das, was das Audit-Log ausschliesst.
-- Der Eintrag ist damit NICHT erledigt, sondern VERSCHOBEN: als operativer
-- Schritt mit echtem Principal nachzutragen, spaetestens bei Oeffnung des
-- ADR-0004-Gates.
