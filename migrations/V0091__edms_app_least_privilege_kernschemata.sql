-- V0091__edms_app_least_privilege_kernschemata.sql
--
-- Die Anwendungs-Laufzeitrolle `edms_app` bekommt endlich die Rechte, die
-- sie fuer `energy`, `identity`, `device` und `measurement` braucht — und
-- ausdruecklich nur die.
--
-- =====================================================================
-- WARUM DAS BISHER FEHLTE UND WARUM DAS NICHT AUFFIEL
-- =====================================================================
-- `compliance/dsgvo/toms.md` fuehrt `edms_app` durchgaengig als
-- "App-Laufzeitrolle" bzw. "App-Verbindung". Gebaut wurde das Rollenmodell
-- aber modulweise: `nachweis`, `analytics`, `consent`, `ingest`, `portal`
-- und `audit` haben ihre Grants bekommen, die KERNSCHEMATA nie. Stand vor
-- dieser Migration:
--
--   energy       1 von 17 beruehrten Tabellen
--   identity     2 von  6   (und beide unbenutzbar, s. u.)
--   device       0 von  2
--   measurement  1 von  2   (ebenfalls unbenutzbar)
--
-- Unbemerkt blieb das, weil Entwicklung und Test ueber `DATABASE_URL` als
-- `edms` verbinden -- und `edms` ist ein echter PostgreSQL-Superuser. Jede
-- Abfrage gelingt dort, unabhaengig davon, ob die Zielrolle sie duerfte. Das
-- gesamte Least-Privilege-Modell war damit im laufenden Betrieb unsichtbar,
-- und die Tests prueften, ob etwas FUNKTIONIERT, nicht ob es ERLAUBT ist.
--
-- Wie folgenreich das ist, hat das database-lead-Review vom 2026-09-17
-- gezeigt: Die C-10-Zaehlung (V0089) enumerierte `energy.zaehler` direkt und
-- waere am Tag der Rollen-Umstellung ausgefallen. Sie war nicht die einzige
-- Stelle, sondern die erste gefundene.
--
-- ZWEI BEREITS VORHANDENE GRANT-SAETZE SIND HEUTE WIRKUNGSLOS: Auf
-- `identity.einwilligung_beleg`, `identity.widerspruch_beleg` und
-- `measurement.messwert_tag` traegt `edms_app` Tabellenrechte -- aber auf den
-- Schemata `identity` und `measurement` KEINE `USAGE`. Ohne die ist ein
-- Tabellenrecht nicht ausuebbar. Die Grants sahen richtig aus und waren es
-- nie; niemand hat sie je unter der Rolle probiert.
--
-- =====================================================================
-- WIE DIE RECHTE HERGELEITET SIND
-- =====================================================================
-- Aus dem Quelltext, Repository fuer Repository: Welche Tabelle wird von der
-- HAUPTVERBINDUNG (`TransactionHost`, also `edms_app`) mit welcher Operation
-- angefasst? Nicht aus der Schema-Struktur abgeleitet und nicht grosszuegig
-- gerundet -- eine Tabelle, die nur gelesen wird, bekommt nur `SELECT`.
--
-- AUSDRUECKLICH NICHT uebernommen wurden drei Zugriffe, obwohl der Code sie
-- ausfuehrt:
--
--   (1) `einfluss.*` -- s. eigener Abschnitt unten. Die TOMs verbieten den
--       Grant, der Code macht ihn trotzdem noetig. Das ist ein Befund, keine
--       Rechtefrage, und wird NICHT durch ein Grant zugedeckt.
--   (2) `INSERT` auf `measurement.messwert` -- s. Abschnitt (5).
--   (3) Rechte, die nur Entwicklungs-Werkzeuge braeuchten (`demo/`,
--       `import/aufbau-pilotbestand-a.ts`). Sie laufen als eigene
--       Einstiegspunkte ueber dieselbe `DATABASE_URL`; in einer
--       Entwicklungsumgebung darf das die Eigentuemer-Rolle sein. Ein
--       Seed-Werkzeug ist kein Grund, der produktiven Laufzeitrolle Rechte
--       zu geben.
--
-- TABELLENWEIT statt spaltenscharf -- mit Begruendung: Bei den engen Rollen
-- (`edms_ingest_worker`, `edms_consent_gate_owner`) ist die Spaltenschaerfe
-- die tragende Kontrolle, weil sie EINEN schmalen Zweck haben. `edms_app`
-- bedient die gesamte Fachanwendung und braucht auf diesen Tabellen
-- praktisch jede Spalte; eine spaltenscharfe Liste waere hier eine lange
-- Aufzaehlung ohne Schutzwirkung, die bei jeder neuen Spalte stillschweigend
-- veraltet. Der Schutz der PII liegt an anderer Stelle und ist real: die
-- Feldverschluesselung in `identity.*`, die `PiiProjektionsPolicy` je
-- Datensatz und die Namensraum-Trennung ohne Cross-Schema-FK.
--
-- KEIN `DELETE`, ausser an vier benannten Stellen (s. u.), und nirgends
-- `TRUNCATE` oder `REFERENCES`.

-- =====================================================================
-- (1) Schema-USAGE
-- =====================================================================
-- `energy` hat sie bereits (V0023). Die drei anderen fehlten -- weshalb die
-- vorhandenen Tabellenrechte dort ins Leere liefen.
GRANT USAGE ON SCHEMA identity    TO edms_app;
GRANT USAGE ON SCHEMA device      TO edms_app;
GRANT USAGE ON SCHEMA measurement TO edms_app;

-- =====================================================================
-- (2) energy -- die Fachdaten ohne Personenbezug
-- =====================================================================
-- Pseudonym-Kennungen, Struktur, Zustaende. Personenbezug liegt in
-- `identity.*` und ist ueber `pseudonym_id` nur app-seitig aufloesbar
-- (ADR-0004 §12, kein Cross-Schema-FK).
GRANT SELECT, INSERT, UPDATE ON energy.endkunde                            TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.anschlussnutzer                     TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.system                              TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.zaehler                             TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.messkanal                           TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.nutzungsverhaeltnis                 TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.zaehler_standort                    TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.messkonzept_version                 TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.messkonzept_version_energietraeger  TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.geraetegruppe_kanal                 TO edms_app;
GRANT SELECT, INSERT, UPDATE ON energy.endkunde_shred_antrag               TO edms_app;

-- Nur angelegt und gelesen, nie geaendert -- eine Messkonzept-Fassung wird
-- durch eine NEUE Fassung ersetzt, nicht ueberschrieben (Zustands-Zeitreihe).
GRANT SELECT, INSERT ON energy.messkonzept               TO edms_app;
GRANT SELECT, INSERT ON energy.geraetegruppe             TO edms_app;

-- Der Unterrichtungs-Nachweis nach Art. 18 Abs. 3 ist ein BELEG: angelegt
-- und gelesen, niemals geaendert. Kein UPDATE, und das ist keine
-- Sparsamkeit, sondern der Punkt -- ein aenderbarer Nachweis ist keiner.
GRANT SELECT, INSERT ON energy.einschraenkung_unterrichtung TO edms_app;

-- Die vier DELETE-Rechte, einzeln begruendet:
--
--   `standort` samt `identity.standort_pii` -- der Standort ist die einzige
--   Stammdaten-Entitaet mit einem echten Loeschpfad in der Betriebssicht
--   (`StandortLoeschenAktion`); ein versehentlich angelegter Standort soll
--   verschwinden koennen, solange nichts daran haengt.
--
--   `baseline_periode` und `messkonzept_version_energietraeger_system` --
--   beide sind ZUORDNUNGEN, keine Historie: Die Perioden einer Fassung bzw.
--   die Systeme eines Energietraegers werden beim Bearbeiten als Menge neu
--   gesetzt (loeschen + neu einfuegen). Ein UPDATE-Weg waere hier die
--   kompliziertere und fehleranfaelligere Variante.
GRANT SELECT, INSERT, UPDATE, DELETE ON energy.standort                              TO edms_app;
GRANT SELECT, INSERT,         DELETE ON energy.baseline_periode                      TO edms_app;
GRANT                         DELETE ON energy.messkonzept_version_energietraeger_system TO edms_app;

-- =====================================================================
-- (3) identity -- die verschluesselte PII
-- =====================================================================
-- Die Anwendung MUSS hier schreiben und lesen: Sie ist die Stelle, die
-- ver- und entschluesselt (`FieldCipherService`), und der Schluesselraum
-- `identity.subjekt_schluessel` traegt das Krypto-Shredding (ADR-0009).
--
-- Was diese Rechte NICHT aufweichen: Die Daten liegen feldverschluesselt
-- (AES-256-GCM, DEK je Subjekt); wer die Zeile liest, hat den Klartext
-- nicht. Und die `PiiProjektionsPolicy` entscheidet JE DATENSATZ, ob die
-- aufrufende Rolle den entschluesselten Wert ueberhaupt zu sehen bekommt --
-- gesperrte (Art. 18) und geschredderte (Art. 17) Saetze fallen dort still
-- heraus. Ein Tabellenrecht ersetzt diese Pruefung nicht und hebt sie nicht
-- auf.
GRANT SELECT, INSERT, UPDATE         ON identity.endkunde_pii         TO edms_app;
GRANT SELECT, INSERT, UPDATE         ON identity.anschlussnutzer_pii  TO edms_app;
GRANT SELECT, INSERT, UPDATE         ON identity.subjekt_schluessel   TO edms_app;
-- DELETE nur hier: Der Standort ist loeschbar (s. o.), und seine PII muss
-- mitgehen -- sonst bliebe ein verwaister PII-Satz ohne Fachzeile zurueck.
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.standort_pii         TO edms_app;

-- `einwilligung_beleg` und `widerspruch_beleg` tragen ihre Rechte bereits
-- aus V0044/V0048 -- sie waren nur ohne Schema-USAGE nicht ausuebbar, was
-- Abschnitt (1) behebt. KEIN UPDATE und KEIN DELETE, dort schon richtig
-- gesetzt: Belege sind append-only.

-- =====================================================================
-- (4) device -- die Geraete-Korrelation
-- =====================================================================
-- Provisionierung bei Installation und Geraetetausch laeuft ueber die
-- Fach-API (`create:geraet_zuordnung`/`update:geraet_zuordnung`,
-- ADR-0005 §26.4), ebenso der Geraete-Krypto-Shred. Der WORKER dagegen hat
-- auf `geraet_zuordnung` nur spaltenscharfes SELECT und auf `schluessel`
-- gar nichts -- diese Trennung bleibt unangetastet.
--
-- KEIN DELETE: Eine Zuordnung wird historisiert (`status='geschreddert'`,
-- `gueltig_bis`), nicht geloescht. Der Blind-Index wird genullt, die Zeile
-- bleibt.
GRANT SELECT, INSERT, UPDATE ON device.geraet_zuordnung TO edms_app;
GRANT SELECT, INSERT, UPDATE ON device.schluessel       TO edms_app;

-- =====================================================================
-- (5) measurement -- LESEN ja, SCHREIBEN nein
-- =====================================================================
-- Die Anwendung liest Messwerte (Verbrauchsansichten, Berechnungslauf,
-- Geraeteerkennung, Verdichtung) und schreibt die TAGES-Aggregate. Sie
-- bekommt BEWUSST KEIN `INSERT` auf `measurement.messwert`.
--
-- Das ist eine Entscheidung GEGEN den Quelltext: `demo/demo-daten.service.ts`
-- fuegt dort ein. Das Demo-Werkzeug ist ein eigener Einstiegspunkt fuer
-- Entwicklungsumgebungen und kann als Eigentuemer-Rolle laufen; der
-- produktive Ingest-Pfad schreibt ohnehin unter `edms_ingest_worker`.
--
-- Der Grund ist nicht Ordnungsliebe: In einem Nachweis-System ist die
-- Faehigkeit, Messwerte zu ERFINDEN, die gefaehrlichste ueberhaupt. Eine
-- kompromittierte API koennte damit Einsparungen fabrizieren, auf denen eine
-- Foerderabrechnung beruht. Dass der Messwert-Schreibpfad allein beim Worker
-- liegt, ist eine Integritaets-Eigenschaft des Nachweises und keine
-- Aufraeumarbeit.
GRANT SELECT ON measurement.messwert TO edms_app;
-- `messwert_tag` traegt SELECT/INSERT/UPDATE bereits aus V0019 -- auch hier
-- fehlte nur die Schema-USAGE aus Abschnitt (1). Das Tages-Aggregat ist
-- abgeleitet und jederzeit neu berechenbar; es zu schreiben ist etwas
-- anderes, als Rohmesswerte zu setzen.

-- =====================================================================
-- (6) einfluss -- AUSDRUECKLICH KEIN GRANT, und warum das ein Befund ist
-- =====================================================================
-- `compliance/dsgvo/toms.md` (Abschnitt 11) ist unmissverstaendlich:
--
--   "`einfluss.*` traegt als EINZIGES Schutzobjekt im System Klartext-PII
--    (Personenanzahl/Nutzflaeche, pii=true) OHNE
--    Feldverschluesselung/Pseudonymisierung; die Trennung wird daher
--    STRUKTURELL ueber eine eigene DB-Rolle erzwungen -- `edms_app` hat auf
--    `einfluss.*` bewusst KEINEN Grant."
--
-- Diese Migration haelt sich daran. Sie deckt damit aber einen Widerspruch
-- auf, der nicht durch Rechte zu loesen ist: SECHS Repositories greifen
-- ueber die HAUPTVERBINDUNG auf `einfluss.*` zu --
--
--   berechnung/persistence/einfluss-intervall-lese.repository.ts
--   einfluss/persistence/tb03-befund.repository.ts
--   stammdaten/persistence/einfluss/einfluss-befund.repository.ts
--   stammdaten/persistence/einfluss/einfluss-intervall.repository.ts
--   stammdaten/persistence/einfluss/einfluss-katalog.repository.ts
--   stammdaten/persistence/nachweis-bestand.repository.ts
--
-- -- und laufen damit heute unter `edms_app`. Dass es funktioniert, liegt
-- allein an der Superuser-Verbindung. Die strukturelle Trennung, die die
-- TOMs als Schutz fuer den einzigen Klartext-PII-Bestand des Systems
-- beschreiben, besteht im Code nicht.
--
-- Ein Grant an dieser Stelle waere die falsche Antwort: Er wuerde eine
-- dokumentierte Kontrolle stillschweigend aufgeben und die TOMs zu einer
-- Behauptung machen. Der richtige Weg ist, diese sechs Repositories auf
-- einen eigenen Pool unter `edms_einfluss` umzustellen -- so, wie es
-- `einfluss/persistence/tb03-einfluss.repository.ts` bereits vormacht. Das
-- ist ein eigener Umbau mit einer echten Folge (der Verlust der ambienten
-- Transaktion) und gehoert nicht in eine Rechte-Migration.
--
-- Bis dahin ist der Zustand benannt statt verdeckt. Die Umstellung der
-- Anwendung auf `edms_app` kann erst danach vollstaendig sein.

COMMENT ON SCHEMA identity IS
  'PII-Namensraum (ADR-0004 §12), physisch separierbar, kein Cross-Schema-FK. USAGE fuer edms_app seit V0091 -- davor waren die in V0044/V0048 vergebenen Tabellenrechte nicht ausuebbar.';
