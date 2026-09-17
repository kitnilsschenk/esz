# UX-Konzept: Betriebs-UI neu geschnitten

Nutzer: Betriebs-Team (`betrieb`), sekundär `compliance-auditor` (lesend), `admin`.
Anlass: Nutzerkritik am bestehenden UI (Health-Startseite, Tabellen-Navigation,
Systeme/Standorte-Verwechslung, Zähler-Sackgasse, Jargon). Grundlage: ADR-0008
(Betriebs-UI, PDP-Aktionen, DS-07-Innensicht §6.5), ADR-0010 (Standort/Gebäude),
`messwerte.openapi.yaml` (Verbrauch aggregiert + break-glass-Lastgang),
Merkblatt-Anforderungen TB-01…TB-09/DE-02.

Ist-Stand geprüft: `AppShell.tsx` rendert `HealthStatusPanel` auf `/`;
`AppNav.tsx` listet exakt sieben gleichrangige Einträge; `ZaehlerDetailAnsicht.tsx`
zeigt nur Stammfelder + Messkanal-CRUD, keinen Standort-Bezug, keine Messwerte;
`VollstaendigkeitTabelle.tsx` ist bislang reiner Endkunde-Rollup (DE-02), TB-04-
Ausfall-Erweiterung (`ebene='zaehler'`, `datenluecke_messwert`) ist in ADR-0005
§27 entschieden, aber im Frontend nicht konsumiert.

## 1. Startseite: „Arbeitsplatz" statt Health

Health verschwindet **nicht**, verliert aber die Startseiten-Rolle. Neue Route
`/` = Dashboard, Health wandert nach `/verwaltung/systemstatus` (admin-only-Eintrag)
plus ein kleiner Ampel-Punkt in der `AuthStatusHeader`-Leiste (Tooltip bei Hover,
Klick öffnet Detail) — Betriebs-Team sieht Auffälligkeiten beiläufig, ohne dass
ein DB-Health-Check die erste Zeile der App ist.

Dashboard-Kacheln (Reihenfolge = Priorität):

1. **Wichtigste Zahl: „Zähler mit Datenausfall"** (TB-04, `andauernd`/`offen`
   aus `ingest.ausfall_vorgang`) — rot wenn > 0, CTA „Störungen ansehen" →
   gefilterte Datenqualitäts-Ansicht. Zeitkritisch, sanktionsbewehrt (TB-04) —
   deshalb Platz 1, nicht die strukturelle Vollständigkeit.
2. **„Endkunden mit Stammdaten-Lücken"** (DE-02, bestehender Rollup) — CTA
   „Lücken beheben" → `/betrieb/datenqualitaet`.
3. **„Unverortete Zähler"** (ADR-0010 D3 nennt diesen Check explizit) — CTA
   „Jetzt zuordnen" → Liste mit Direktlink zur Verortungs-Aktion.
4. Schnellzugriffe als Buttons, kein Untermenü nötig: „Neuer Endkunde",
   „Neuer Zähler", „Zähler verorten".
5. **Platzhalter-Kachel** (grau, „bald"): Baseline/Einsparung (ADR-0006),
   BAFA-Export-Status (ADR-0007) — Grid ist so gebaut, dass diese Kacheln ohne
   Layout-Umbau nachrücken, sobald die Endpunkte existieren.

Kein Ladezustand blockiert die ganze Seite: jede Kachel lädt unabhängig
(eigener Pending/Error-Zustand), damit ein einzelner langsamer Endpoint nicht
das gesamte Dashboard verzögert.

## 2. Navigation: aufgabenorientiert statt Tabellen-Liste

Drei sichtbare Gruppen + eine admin-only Gruppe, statt sieben Flach-Einträge.
Gruppenüberschriften sind nicht klickbar (reine Gliederung).

**Kunden**
- Endkunden
- Anschlussnutzer & Verträge *(zusammengelegt: bisherige Einträge
  „Nutzungsverhältnisse" + „Anschlussnutzer" werden EIN Eintrag; beide sind
  fast immer im Kontext eines Endkunden relevant — Haupt-Einstieg bleibt die
  Endkunde-Detailseite mit „Verträge"-Tab, dieser Nav-Eintrag ist der
  sekundäre, seitenübergreifende Such-Zugang, deshalb kleiner/eingerückt
  dargestellt)*

**Messstellen & Geräte** *(hier sitzt die Systeme/Standorte-Aufklärung)*
- Zähler & Messkanäle *(vorher „Zähler")*
- Systemgrenzen (Messkonzept) *(vorher „Systeme" — Klammerzusatz macht die
  fachliche Bilanzgrenze im Label selbst sichtbar)*
- Gebäude & Räume *(vorher „Standorte" — signalisiert räumlich statt fachlich)*

Zwischen den letzten beiden Einträgen steht eine schmale, nicht interaktive
Erklärzeile (grau, klein): „Systemgrenzen = wofür (fachlich) · Gebäude/Räume =
wo (räumlich)". Das löst Kritikpunkt 3 direkt an der Stelle, an der die
Verwechslung entsteht — kein separates Hilfe-Dokument nötig.

**Betrieb**
- Datenqualität & Störungen *(vorher „Vollständigkeit" — neuer Name deckt die
  TB-04-Erweiterung mit ab, sobald sie im Frontend konsumiert wird)*
- Platzhalter-Einträge „Baseline & Einsparung", „BAFA-Export" (grau, „bald")

**Verwaltung** *(nur `admin`)*
- Systemstatus (der bisherige `HealthStatusPanel`-Inhalt)

Ergebnis: sechs aktive Einträge statt sieben, davon drei klar geclustert statt
gleichrangig; kein Datenmodell-Name mehr ohne fachliche Einordnung im Label.

## 3. Zähler-Detailseite: „Was liefert der Zähler?" beantworten

Neue Blockreihenfolge (oben → unten):

1. Kopf: Zählernummer, Status-Badge, Energieträger (bestehend).
2. **Neu — Standort-Block, direkt unter dem Kopf.** Zeigt den Pfad als
   Breadcrumb (Liegenschaft › Gebäude › Etage › Raum) mit Link zum
   Standort-Knoten. **Empty-State**, wenn unverortet: „Dieser Zähler ist
   noch keinem Standort zugeordnet." + Button „Standort zuordnen" (öffnet die
   bestehende Verortungs-Aktion `POST .../verortung`). **Backend-Bedarf:**
   Es existiert aktuell **kein** Lesepfad „aktuelle Verortung eines Zählers"
   (nur `GET /stammdaten/standorte/{id}/zaehler`, die Umkehrrichtung). Neuer,
   schlanker Endpoint oder Zusatzfeld auf der Zähler-Detail-Antwort nötig
   (`standortPfad`, `standortId`, `verortetSeit`).
3. **Neu — Datenfluss-Status** (zusammengefasst, nicht break-glass): „Letzte
   Übertragung: vor 3 Std." + Badge je Frische-Schwelle (analog TB-04). Nutzt
   Metadaten (`kanal_status.letzter_ts`), **keine** Werte — braucht kein
   Zweck-Header. Beantwortet die Frage „läuft der Zähler noch?" ohne
   break-glass-Hürde.
4. Messkanäle-Tabelle (bestehend), **erweitert um zwei Spalten**: „Letzte
   Übertragung" (Freshness je Kanal) und Aktion „Lastgang ansehen" — löst
   den break-glass-Fluss aus (`read:verbrauch_detail`, Zweck-Auswahl +
   Zeitfenster ≤ Maximum, Pflichtfeld „Grund", z. B. Störungsdiagnose).
   **Bewusst kein Dauer-Diagramm hier** — DS-07-Innensicht (ADR-0008 §6.5)
   verlangt deny-by-default für Detailinhalte; die Freshness-Zeile deckt den
   Alltagsfall „läuft's?" ab, der Lastgang bleibt zweckgebunden und auditiert.
5. Ändern/Stilllegen-Aktionen (bestehend, unverändert an Position/Verhalten).
6. Zurück-Link (bestehend).

## 4. Verbrauch auf Endkunden-Ebene

Neuer Tab „Verbrauch" auf der Endkunde-Detailseite. Aggregationsregel:

- **Ein Wurzel-Standort (Regelfall):** direkte Einbettung der bestehenden
  `VerbrauchAnsicht` mit `standortId` = Wurzel, `inklusiveUnterknoten=true` —
  liefert den Gesamtverbrauch des gesamten Gebäudebaums ohne neuen Endpoint.
- **Mehrere Wurzeln (mehrere Liegenschaften):** **kein** einzelner
  Gesamtwert. Stattdessen eine Kachel je Liegenschaft (Label aus dem
  bestehenden Batch-Label-Call), jede mit eigenem Diagramm. Begründung:
  `messwerte.openapi.yaml` verbietet ausdrücklich das Summieren
  unterschiedlicher Messgrößen/Einheiten — ein einzelner „Endkunden-Gesamt-
  Wert" würde genau das verschleiern (z. B. Strom + Wärme über zwei
  Gebäude). **Kein Backend-Bedarf**: die Liste der Wurzelknoten ist über den
  bestehenden Standorte-Endpoint (Filter `parentId = null` clientseitig)
  bereits erreichbar.

## 5. Begriffserklärungen (nur die, die wirklich stolpern)

| Begriff | Tooltip-Satz |
|---|---|
| Systemgrenze (Systeme) | „Die fachliche Bilanzgrenze für die Einsparberechnung — nicht der Gebäudestandort." |
| Gebäude & Räume (Standorte) | „Die räumliche Struktur, an der Zähler physisch hängen — unabhängig von der fachlichen Systemgrenze." |
| Nutzungsverhältnis | „Zeitlich befristete Zuordnung eines Anschlussnutzers zu einem Endkunden-Vertrag — endet automatisch beim Auszug, ohne Datenverlust." |
| Anschlussnutzer | „Wer den Anschluss tatsächlich nutzt (z. B. Mieter) — kann vom Endkunden (Vertragspartner) abweichen." |
| Datenqualität & Störungen | „Zeigt fehlende Stammdaten (z. B. kein Messkonzept) und ausbleibende Messwerte je Endkunde bzw. Zähler." |
| „Lastgang ansehen" (break-glass) | „Der Rohverlauf ist zweckgebunden geschützt. Bitte Grund angeben — der Zugriff wird protokolliert." |

## 6. Priorisierung (Aufwand vs. Wirkung)

1. **Startseite ersetzen** — reine Frontend-Komposition bestehender Endpunkte
   (Monitoring, Standorte), größter Wahrnehmungssprung.
2. **Navigation umbauen** (Gruppen, Umbenennung, Zusammenlegung, Erklärzeile)
   — reine IA/Copy, kein Backend, löst Kritikpunkt 2+3 direkt.
3. **Zähler-Detail: Standort-Block + Freshness** — kleiner, klar
   umrissener Backend-Zusatz (Verortung lesbar machen), schließt die
   Sackgasse aus Kritikpunkt 4.
4. **Begriffs-Tooltips** — im selben Zug wie 2/3, minimaler Zusatzaufwand.
5. **Endkunde-Verbrauch-Tab** — Frontend-Komposition, kein Backend-Bedarf im
   Regelfall (ein Wurzelstandort).
6. **Datenqualität & Störungen um TB-04 erweitern** (`ebene='zaehler'`,
   `datenluecke_messwert`, `ingest.ausfall_vorgang`) — größter Compliance-
   Nutzen, aber echter Backend-Aufwand (ADR-0005 §27 bereits entschieden,
   noch nicht ans Frontend geliefert); zuletzt, mit `backend-lead`/
   `iot-ingestion-engineer` abstimmen.

Delegation: Umsetzung 1–5 → `react-developer`/`frontend-lead`; Backend-Bedarf
aus Punkt 3 und 6 → `backend-lead`/`api-developer`; Tastatur-/Screenreader-
Feinschliff der neuen Dashboard-Kacheln und der Standort-Breadcrumb →
`accessibility-engineer`.
