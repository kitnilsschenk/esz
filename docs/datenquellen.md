# Datenquellen-Register

Register aller **extern bezogenen Sachdaten** (keine Code-Abhängigkeiten — die
stehen in `docs/architecture/dependency-log.md`). Pflicht laut
`.claude/rules/dependencies.md`, Abschnitt „Datenlizenzen".

Zweck: Die Attributionspflicht der Datenlizenzen ist nur erfüllbar, wenn der
**wörtliche** Quellenvermerk an einer Stelle steht und von dort referenziert
wird. Duplizierte Vermerkstexte driften auseinander — dann ist die Pflicht
formal verletzt, ohne dass es jemand merkt.

## Register

### DQ-001 — DWD Open Data / Climate Data Center (CDC)

| Feld | Wert |
|---|---|
| **Zweck im EDMS** | Tagestemperaturen → Gradtagzahlen (VDI 3807) für die Witterungsbereinigung der Baseline (ADR-0006, D4/D5) |
| **Anbieter** | Deutscher Wetterdienst (DWD), Bundesoberbehörde im Geschäftsbereich des BMDV |
| **Bezugsweg** | Bulk-Download öffentlicher Dateien von `opendata.dwd.de` — **keine** parametrisierte API, **keine** Übermittlung von Endkunden-, Standort- oder Zähler-Identifikatoren (Auflage A-4) |
| **Lizenz** | Creative Commons BY 4.0 bzw. GeoNutzV, jeweils „unter Beigabe eines Quellenvermerks" |
| **Lizenz-Fundstellen** | `https://www.dwd.de/DE/leistungen/opendata/faqs_opendata.html` · `https://opendata.dwd.de/climate_environment/CDC/Nutzungsbedingungen_German.pdf` |
| **Kommerzielle Nutzung** | ausdrücklich zulässig |
| **Copyleft / Share-Alike** | keines — Ableitungen (Gradtagzahlen, bereinigte Einsparwerte) dürfen weitergegeben werden |
| **Wörtlicher Quellenvermerk** | `Quelle: Deutscher Wetterdienst` — **übernommen am 2026-09-09** (Auflage A-1 erfüllt). Änderungsvermerk: `Datenbasis: Deutscher Wetterdienst, Einzelwerte zu Gradtagzahlen nach VDI 3807 aggregiert.` Beide als zentrale Konstanten in `src/backend/src/berechnung/klima/dwd-quellenvermerk.const.ts`. Fundstellenkette und Begründung unten. |
| **Änderungsvermerk (Art. 3a CC BY)** | „Daten verändert: Aggregation zu Gradtagzahlen nach VDI 3807" |
| **Abrufdatum Lizenzprüfung** | 2026-07-24 |
| **Datenstand/Version** | je Abruf zu persistieren (Auflage A-3: Stations-ID, Zeitraum, Abrufzeitpunkt, Dateiversion, Lizenzkennung) |
| **DSGVO** | nicht personenbezogen; **kein Auftragsverarbeiter**, kein AVV, kein TIA, kein Drittlandtransfer (`compliance-director`-Votum 2026-07-24) |
| **Compliance-Votum** | ADR-0006 O-B1, `compliance-director` 2026-07-24: **kein Veto**, Auflagen A-1 bis A-5 |
| **Bezugs-Endpunkte** | `…/observations_germany/climate/daily/kl/recent/tageswerte_KL_<id>_akt.zip` (vorläufig, ~500 Tage) · `…/historical/tageswerte_KL_<id>_<von>_<bis>_hist.zip` (geprüft, bis zum letzten Jahresende) |
| **Status** | freigegeben; **angebunden** seit 2026-09-09 — `DwdKlimaQuelleAdapter` (`src/backend/src/berechnung/klima/dwd/`), aktiv nur mit `EDMS_KLIMA_QUELLE=dwd` (Default bleibt `synthetic`) |

## Wörtlicher Quellenvermerk (A-1) — übernommen am 2026-09-09

**Status: erfüllt.** Freigabe durch den User am 2026-09-09; bis dahin stand im
Code ein Platzhalter, der den Förderjahr-Preflight (`FJ-08`) und die Erzeugung
von Kundendokumenten mit DWD-Werten fail-closed blockiert hat.

### Fundstellenkette (der Beleg, nicht nur das Ergebnis)

Sie endet **nicht** in `Nutzungsbedingungen_German.pdf`, wie diese Seite bis
zum 2026-09-09 annahm. Das PDF (Stand Mai 2024, eine Seite) nennt nur die
Lizenz — CC BY 4.0 — und verweist für Einzelheiten auf
`https://www.dwd.de/copyright`. Dieser Kurzlink führt auf „Rechtliche
Hinweise", von dort auf die Seite **„Vorgaben für die Gestaltung des
DWD-Quellenvermerks"**
(`https://www.dwd.de/DE/service/rechtliche_hinweise/vorlagen_quellenangabe.html`,
abgerufen 2026-09-09). Erst dort steht der Wortlaut, und zwar als Vorgabe nach
**§ 7 DWD-Gesetz**:

- **Unveränderte Verwendung**, in Textform: `Quelle: Deutscher Wetterdienst`
- **Nach Bearbeitung** verlangt der DWD zusätzlich einen Veränderungshinweis
  und gibt dafür das Muster `Datenbasis: Deutscher Wetterdienst, …` vor,
  ausdrücklich auch für den Fall gemittelter Einzelwerte.

### Was übernommen wurde

| Konstante | Wert | Art |
|---|---|---|
| `DWD_QUELLENVERMERK` | `Quelle: Deutscher Wetterdienst` | wörtliche Übernahme der DWD-Vorgabe |
| `DWD_AENDERUNGSVERMERK` | `Datenbasis: Deutscher Wetterdienst, Einzelwerte zu Gradtagzahlen nach VDI 3807 aggregiert.` | DWD-Muster, hinter dem Komma unsere eigene Verarbeitung |

**Kein Zusatz zum Quellenvermerk.** Der DWD ist Lizenzgeber und gibt selbst
vor, was er erwartet; diese Vorgabe wörtlich zu übernehmen ist die sicherste
Auslegung von A-1. Eine angehängte Lizenzkennung („… CC BY 4.0") wäre kein
wörtliches Zitat mehr — die Lizenzangabe steht stattdessen an der Datenzeile
selbst (`analytics.klima_tag.lizenz_id`, V0063) und in der Tabelle oben.

### Was die Übernahme entriegelt hat

- **`FJ-08`** feuert nicht mehr. Der Förderjahr-Preflight bleibt rot, aber nur
  noch wegen **`FJ-09`** (`EDMS_SYNTHETIC_ONLY=true`, Ingest-Gate ZU) — und
  das ist eine eigene, unberührte Entscheidung (AW-28).
- Die **Erzeugung von Kundendokumenten** mit DWD-abgeleiteten Werten ist
  wieder möglich (`NutzerinfoDokumentService`); der Riegel bleibt als
  Rückfallsicherung bestehen und greift, falls der Text je wieder durch einen
  Entwurf ersetzt wird.

## Wo die Attribution erscheinen muss (Minimum-Set, Auflage A-2)

Pflicht an genau drei Stellen:

1. **BAFA-/Nachweis-Exporte** — Quellenvermerk **und** Änderungsvermerk im
   Metablatt bzw. Kopfbereich jedes Exports, der witterungsbereinigte Werte
   enthält. Nicht je Datenzeile. Fachlich ohnehin nötig: ohne Quellenangabe
   (Station, Zeitraum, Datenstand) ist die Bereinigung für das BAFA nicht
   reproduzierbar.
2. **Repo-Doku** — dieses Register, verlinkt aus der README.
3. **Kundengerichtete Ausgaben** — monatliche Nutzerinformation und jede
   UI-Ansicht, die bereinigte Werte zeigt; ein Fußnotensatz genügt.

   **Stand 2026-09-09:** Erfüllt im **Kundendokument** der monatlichen
   Nutzerinformation (`nutzerinfo-dokument.renderer.ts`) — dort stehen
   Quellen- und Änderungsvermerk in der Fußzeile, und zwar NUR, wenn in den
   zugrunde liegenden Berechnungslauf tatsächlich DWD-Werte eingegangen sind
   (`NutzerinfoRepository.findLaeufeMitDwdKlima`); bei synthetischem Klima
   wäre der Vermerk eine Falschangabe (A20).

   **Offen:** die **Betriebs-Vorschau** im Frontend
   (`NutzerinfoBericht.tsx`) zeigt dieselben bereinigten Werte ohne Vermerk.
   Sie ist heute keine kundengerichtete Ausgabe (nur der Betrieb sieht sie),
   wird aber zur Vorlage des späteren Nutzerportals — spätestens dort ist der
   Vermerk nachzuziehen. Seit der A-1-Freigabe wäre er auch sofort korrekt
   anzeigbar; es fehlt nur die Angabe im Bericht-DTO, ob DWD-Werte in den
   zugrunde liegenden Lauf eingegangen sind.

Empfohlen, nicht bindend: globaler UI-Footer bzw. Seite „Rechtliches". Der
**SBOM ist ausdrücklich nicht der richtige Ort** — er ist eine
Software-Stückliste, die Attribution gehört hierher.

## Auflage A-3 — was je Abruf gespeichert wird

`analytics.klima_tag` trägt seit V0063 die vollständige Belegkette einer
Zeile: `station_ref` (Stations-ID), `tag`/`revision` (Zeitraum und Stand),
`abgerufen_at` (Abrufzeitpunkt), `quelle` (`dwd_cdc_kl_tag`),
`datei_version` (Archivname samt Zeitraum — beim DWD **ist** der Name die
Version) und `lizenz_id` (`CC-BY-4.0`). `qualitaets_niveau` hält zusätzlich
die DWD-Spalte `QN_4` fest; sie unterscheidet den vorläufigen `recent`-Wert
vom geprüften `historical`-Wert und ist damit der Grund, warum eine spätere
Revision überhaupt entstehen kann.

Für synthetische Werte bleiben `datei_version` und `lizenz_id` **leer** —
eine Lizenzangabe an gerechneten Zahlen wäre sachlich falsch.

## Rote Linie

**Keine Rohdaten Dritter im Repository.** Testfixtures sind synthetisch
(`.claude/rules/tests.md`). Der Lizenzkonflikt ist derzeit vollständig
entschärft, weil die DWD-Daten in der Datenbank liegen und das veröffentlichte
Artefakt (Apache-2.0) kein CC-BY-Material enthält. Sobald echte DWD-Werte als
Fixture, Seed oder Beispieldatei ins Repo wandern, kippt diese Bewertung und der
Attributionsvermerk wird auch im Repo zur Pflicht.
