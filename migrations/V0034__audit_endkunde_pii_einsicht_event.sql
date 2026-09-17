-- V0034__audit_endkunde_pii_einsicht_event.sql
--
-- ADR-Bezug: ADR-0008 D12 (Nachtrag zu D1/D6, 2026-08-26), Auflage A6 des
-- `compliance-director`-Votums, gegengezeichnet mit K1/K5.
--
-- Legt den Audit-Event-Typ `endkunde.pii.einsicht` an -- den es bislang NICHT
-- gibt. Klartext-PII-Lesen ist im Repo dreifach protokollpflichtig
-- (`standort.pii.einsicht` V0018, `einflussgroesse.stammdaten.einsicht` V0021,
-- `stammdaten.verbrauch_detail.einsicht`), ausgerechnet bei der
-- Kern-Stammdaten-PII des Endkunden aber nicht.
--
-- =====================================================================
-- Wofuer der Code gebraucht wird
-- =====================================================================
-- D12 beschliesst einen Batch-Endpunkt `POST /stammdaten/endkunden/labels`,
-- der Endkunden-Klartextnamen fuer die Rolle `betrieb` aufloest. Ohne ihn sind
-- Endkunden in Listen und Auswahlfeldern ausschliesslich ueber ein
-- 8-Zeichen-UUID-Praefix identifizierbar; der `compliance-director` bewertet
-- diesen Zustand als Fehlzuordnungsrisiko nach Art. 5 Abs. 1 lit. d, das in
-- die Nutzerinformation und den BAFA-Nachweis fortwirkt.
--
-- Das Listen-Schema bleibt dabei unveraendert PII-frei (ADR-0008 §13 gilt
-- fort): Die Aufloesung geschieht in einem SEPARATEN Vorgang mit eigener
-- Fachaktion (`read:endkunde_pii`), eigenem Gate und -- hier -- eigenem
-- Audit-Event.
--
-- =====================================================================
-- Kontext-Whitelist: warum genau diese drei Schluessel
-- =====================================================================
-- `ARRAY['synthetic','anzahl_endkunden','anzahl_angefragt']`.
--
-- EIN Event je AUFRUF, nicht eines je Endkunde (A6). Der Standort-Praezedenz-
-- fall (V0018 (7)) hat diese Granularitaet bereits entschieden: Ein Event je
-- Datensatz erzeugte bei jedem Seitenaufbau 50--100 Zeilen und machte das
-- Audit-Log unlesbar -- die wirklich kritischen Ereignisse (break-glass
-- Lastgang, Krypto-Shredding, Export-Abruf) gingen im Rauschen unter.
--
-- `anzahl_angefragt` ist die ERGAENZUNG gegenueber dem Standort-Muster und der
-- eigentliche Grund, warum "je Aufruf" hier verhaeltnismaessig ist: Auflage A4
-- verlangt, dass die `PiiProjektionsPolicy` JE DATENSATZ ausgewertet wird und
-- gesperrte (Art. 18) wie krypto-geschredderte (Art. 17) Endkunden STILL aus
-- der Antwort fallen. Ob das tatsaechlich geschieht, ist nur an der DIFFERENZ
-- `anzahl_angefragt - anzahl_endkunden` ablesbar. Ohne diesen Schluessel waere
-- A4 nicht auditierbar -- die Wirksamkeit der Policy bliebe behauptet statt
-- belegt (Art. 5 Abs. 2).
--
-- BEWUSST NICHT in der Whitelist:
--
--   * die LISTE der aufgeloesten Endkunden-Ids. Sie machte das Audit-Log zur
--     zweiten Kundenkartei und waere selbst eine Minimierungsverletzung
--     (Art. 5 Abs. 1 lit. c). Technisch ohnehin ausgeschlossen:
--     `audit.event_seal()` (V0003) akzeptiert nur Skalare.
--   * `endkunde_id`. Anders als beim Standort-Code (V0018 (7)), dessen Route
--     unter `{endkundeId}` liegt und den Mandanten deshalb fuehrt, gibt es
--     hier keinen einzelnen Mandanten -- der Batch geht ueber beliebige
--     Endkunden. Ein Schluessel dafuer waere entweder leer oder eben die
--     verbotene Liste (K1).
--
-- =====================================================================
-- Vorwaertskompatibilitaet: Mangel M-1
-- =====================================================================
-- Der Klartext-Namensabruf auf der Endkunde-DETAILSEITE
-- (`GET /stammdaten/endkunden/{endkundeId}`) ist bis heute unprotokolliert
-- (`endkunde.controller.ts`, kein `@AuditAction`). Das ist als eigenstaendiger
-- Mangel M-1 erfasst (ADR-0008 §29 C13) und auf User-Entscheidung vom
-- 2026-08-26 GETRENNT von D12 zu beheben, faellig vor
-- `EDMS_SYNTHETIC_ONLY=false`.
--
-- Diese Migration legt den Code trotzdem SO an, dass M-1 spaeter OHNE zweite
-- Katalog-Migration andocken kann -- ein Code, zwei Kontextauspraegungen:
--
--   Detailseite (M-1, spaeter): objekt_ref=endkundeId, anzahl_angefragt=1,
--                               anzahl_endkunden=1
--   Batch        (D12, jetzt):  objekt_ref=NULL,       anzahl_angefragt=m,
--                               anzahl_endkunden=n
--
-- Das ist der ganze Grund, warum `anzahl_angefragt`/`anzahl_endkunden` schon
-- jetzt in der Whitelist stehen, obwohl der Batch-Pfad allein mit ihnen
-- auskaeme: `audit.event_seal()` weist nicht gelistete Keys FAIL-CLOSED ab,
-- eine spaetere Erweiterung kostet eine SCD2-Nachtragsmigration
-- (Praezedenzfall V0016). `audit.event.objekt_ref` ist dagegen bereits
-- tabellenweit nullable (V0003) und braucht KEINE Vorkehrung; einen
-- per-Code-Schalter dafuer kennt der Katalog nicht (K1 korrigiert hier eine
-- urspruenglich falsch abgeleitete Auflage).
--
-- =====================================================================
-- rolle_erfassen = true
-- =====================================================================
-- Wie bei jedem Klartext-PII-Lesezugriff im Repo
-- (`standort.pii.einsicht` V0018, `einflussgroesse.stammdaten.einsicht`
-- V0021, `stammdaten.verbrauch_detail.einsicht`): Wer eingesehen hat, ist Teil
-- des Nachweises. Das macht den Bestand beschaeftigtenbezogen -- die
-- Zweckbindung (Missbrauchs-/Sicherheitserkennung, NICHT Leistungs- oder
-- Verhaltenskontrolle, Art. 88 DSGVO / § 26 BDSG) ist in `rvt.md` VT-0002 zu
-- verankern (D12 §7, Auflage A10/K10).
--
-- `pflichtereignis=false` -- wie die uebrigen Einsicht-Codes.
--
-- =====================================================================
-- Aufbewahrung
-- =====================================================================
-- KEINE Sonderfrist (A7). Laeuft unter der bestehenden Zeile "Audit-Events"
-- der Retention-Matrix (F2-Arbeitshypothese, gekoppelt an O2/A-O6), Loeschung
-- ausschliesslich ueber den kontrollierten `drop_chunks()`-Sonderpfad. Nicht
-- kuerzer: Das Log ist der Nachweis der Zugriffskontrolle und darf nie vor den
-- ueberwachten Daten verfallen.

INSERT INTO audit.event_typ (code) VALUES
    ('endkunde.pii.einsicht');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'endkunde.pii.einsicht', 'endkunde', 'lesen',
     ARRAY['synthetic','anzahl_endkunden','anzahl_angefragt'], true, false, true,
     'Klartext-Einsicht in Endkunden-PII (PolicyAction read:endkunde_pii, ADR-0008 D12). ZWEI Auspraegungen unter EINEM Code: (a) Batch-Aufloesung POST /stammdaten/endkunden/labels -- objekt_ref=NULL, kontext.anzahl_angefragt=Groesse der Anfrageliste, kontext.anzahl_endkunden=Groesse der Antwortliste; die DIFFERENZ belegt, wie viele Saetze wegen Art.-18-Sperre, Art.-17-Shredding oder Nicht-Existenz still gefiltert wurden (Auflage A4, ohne diesen Beleg waere A4 nicht auditierbar). (b) RESERVIERT fuer Mangel M-1 (ADR-0008 §29 C13, faellig vor EDMS_SYNTHETIC_ONLY=false): Einzelabruf GET /stammdaten/endkunden/{endkundeId} -- objekt_ref=endkundeId, anzahl_angefragt=1, anzahl_endkunden=1. Solange M-1 offen ist, deckt dieser Code AUSSCHLIESSLICH den Batch-Pfad ab; aus seinem Vorhandensein darf NICHT geschlossen werden, dass PII-Lesezugriffe auf Endkunden vollstaendig protokolliert sind. GENAU EIN Event je Aufruf, NICHT eines je Endkunde (A6, Praezedenzfall standort.pii.einsicht V0018). Die Liste der aufgeloesten Ids gehoert BEWUSST NICHT in den Kontext (zweite Kundenkartei, Art. 5 Abs. 1 lit. c) -- ebenso wenig endkunde_id, da der Batch mandantenuebergreifend ist. rolle_erfassen=true wie bei jedem Klartext-PII-Lesezugriff; die daraus folgende beschaeftigtenbezogene Auswertung ist zweckgebunden auf Missbrauchs-/Sicherheitserkennung (Art. 88 DSGVO / § 26 BDSG, rvt.md VT-0002).',
     now());
