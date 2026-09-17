// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/stammdaten`, ADR-0008 Teil B / D11). Die
// generated/-Rohtypen selbst werden bewusst NICHT pauschal re-exportiert
// (siehe `index.ts` und die analoge Health-/Auth-Konvention in
// `types.ts`/`authTypes.ts`).
//
// Diese Datei wächst additiv mit jeder neuen Stammdaten-Entität (System,
// Zähler, Messkanal, Messkonzept, Anschlussnutzer, Nutzungsverhältnis,
// Monitoring) — jede neue Entität ergänzt hier nur neue Export-Zeilen, ändert
// aber keine bestehenden (konfliktarm für parallele Arbeit, siehe
// `features/stammdaten/index.ts`-Dokumentation zum selben Muster).

import type { components } from './generated/stammdaten';

export type SeitenInfo = components['schemas']['SeitenInfo'];
export type VerarbeitungsStatus = components['schemas']['VerarbeitungsStatus'];
export type ConsentStatus = components['schemas']['ConsentStatus'];
export type Energietraeger = components['schemas']['Energietraeger'];
export type BetriebsStatus = components['schemas']['BetriebsStatus'];
export type MessgroesseArt = components['schemas']['MessgroesseArt'];
export type Messrichtung = components['schemas']['Messrichtung'];
export type Datenklasse = components['schemas']['Datenklasse'];
export type NutzungsRolle = components['schemas']['NutzungsRolle'];

// --- Endkunde (Referenz-Entität, Phase 4c) -------------------------------
export type EndkundeListItem = components['schemas']['EndkundeListItem'];

// ADR-0008 **D12** — Batch-Aufloesung von Klartextnamen fuer Listen und
// Auswahlfelder. Bewusst EIGENE, dedizierte Typen NEBEN `EndkundeListItem`:
// Das Listen-Schema bleibt schema-erzwungen PII-frei (§13/D1 gilt fort), die
// Aufloesung ist ein SEPARATER Vorgang mit eigener Fachaktion
// (`read:endkunde_pii`), eigenem Gate und eigenem Audit-Event.
// `EndkundeLabelItem` traegt AUSSCHLIESSLICH `{id, name}` (Auflage A1) und
// darf NICHT wiederverwendet oder um Felder erweitert werden.
export type EndkundeLabelItem = components['schemas']['EndkundeLabelItem'];
export type EndkundeLabelsAnfrage = components['schemas']['EndkundeLabelsAnfrage'];
export type EndkundeListe = components['schemas']['EndkundeListe'];
export type EndkundePii = components['schemas']['EndkundePii'];
export type EndkundeDetail = components['schemas']['EndkundeDetail'];
export type EndkundeAnlegen = components['schemas']['EndkundeAnlegen'];
export type EndkundeAendern = components['schemas']['EndkundeAendern'];
/** Request-Body von `POST /stammdaten/endkunden/{endkundeId}/sperren` (Art. 18, Grund ist Pflicht). */
export type EndkundeSperren = components['schemas']['EndkundeSperren'];
/** Request-Body von `POST /stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren`. */
export type AnschlussnutzerSperren = components['schemas']['AnschlussnutzerSperren'];
/** Body der Unterrichtungs-Route (Art. 18 Abs. 3), geteilt von Endkunde und Anschlussnutzer. */
export type EinschraenkungUnterrichtung = components['schemas']['EinschraenkungUnterrichtung'];
/** Wiedervorlage der befristeten Art.-18-Tatbestaende (A11.11). */
export type EinschraenkungFristReport = components['schemas']['EinschraenkungFristReport'];
export type EinschraenkungFristItem = components['schemas']['EinschraenkungFristItem'];
/** Geschlossene Liste der vier Tatbestaende des Art. 18 Abs. 1 DSGVO. */
export type EinschraenkungGrund = components['schemas']['EinschraenkungGrund'];
// Feature-Pass B (Sperren Art. 18 / Kryptoshredding Art. 17):
export type KryptoShreddingAnweisung = components['schemas']['KryptoShreddingAnweisung'];
export type ShreddingErgebnis = components['schemas']['ShreddingErgebnis'];
// ADR-0009 (Vier-Augen-Krypto-Shredding) — `.../kryptoshredding` (Direkt-POST)
// ist ENTFERNT; ersetzt durch den Antrag/Freigabe/Ablehnen-Workflow unter
// `.../shred-antraege`. `KryptoShreddingAnweisung` bleibt oben bestehen (jetzt
// Body von `shredAntragBeantragen`, s. `endkundeApi.ts`).
export type ShredAntragStatus = components['schemas']['ShredAntragStatus'];
export type ShredAblehnungsgrund = components['schemas']['ShredAblehnungsgrund'];
export type ShredAntrag = components['schemas']['ShredAntrag'];
export type ShredAntragListe = components['schemas']['ShredAntragListe'];
export type ShredFreigebenAnweisung = components['schemas']['ShredFreigebenAnweisung'];
export type ShredAblehnenAnweisung = components['schemas']['ShredAblehnenAnweisung'];
export type ShredFreigebenErgebnis = components['schemas']['ShredFreigebenErgebnis'];

// --- System (Phase 4c, Pass 1) --------------------------------------------
export type SystemListItem = components['schemas']['SystemListItem'];
export type SystemListe = components['schemas']['SystemListe'];
export type SystemDetail = components['schemas']['SystemDetail'];
export type SystemAnlegen = components['schemas']['SystemAnlegen'];
export type SystemAendern = components['schemas']['SystemAendern'];

// --- Zähler (Phase 4c, Pass 1) ---------------------------------------------
export type ZaehlerListItem = components['schemas']['ZaehlerListItem'];
export type ZaehlerListe = components['schemas']['ZaehlerListe'];
export type ZaehlerDetail = components['schemas']['ZaehlerDetail'];
export type GeraetZuordnungStatus = components['schemas']['GeraetZuordnungStatus'];
export type GeraetZuordnungAnlegen = components['schemas']['GeraetZuordnungAnlegen'];
export type GeraetZuordnungAendern = components['schemas']['GeraetZuordnungAendern'];
export type GeraetZuordnungDetail = components['schemas']['GeraetZuordnungDetail'];
/** Anzeige-Ausschnitt am Zähler (ADR-0011 D7) — OHNE DevEUI/Blind-Index. */
export type GeraetAnbindung = components['schemas']['GeraetAnbindung'];
export type ZaehlerAnlegen = components['schemas']['ZaehlerAnlegen'];
export type ZaehlerAendern = components['schemas']['ZaehlerAendern'];

// --- Messkanal (inkl. Sub-Ressource MesskanalUnterZaehler, Phase 4c, Pass 1) ----
export type MesskanalListItem = components['schemas']['MesskanalListItem'];
export type MesskanalListe = components['schemas']['MesskanalListe'];
export type MesskanalDetail = components['schemas']['MesskanalDetail'];
export type MesskanalAnlegen = components['schemas']['MesskanalAnlegen'];
export type ErwarteterMesskanal = components['schemas']['ErwarteterMesskanal'];
export type GeraetetypKatalogItem = components['schemas']['GeraetetypKatalogItem'];
export type GeraetetypKatalog = components['schemas']['GeraetetypKatalog'];
export type MesskanalAendern = components['schemas']['MesskanalAendern'];

// --- Nutzungsverhältnis (Phase 4c, Pass 1) --------------------------------
export type NutzungsverhaeltnisListItem = components['schemas']['NutzungsverhaeltnisListItem'];
export type NutzungsverhaeltnisListe = components['schemas']['NutzungsverhaeltnisListe'];
export type NutzungsverhaeltnisDetail = components['schemas']['NutzungsverhaeltnisDetail'];
export type NutzungsverhaeltnisAnlegen = components['schemas']['NutzungsverhaeltnisAnlegen'];
export type NutzungsverhaeltnisBeenden = components['schemas']['NutzungsverhaeltnisBeenden'];

// --- Anschlussnutzer (volle Feature-Slice, Phase 4c Pass 2 — PII-Entität,
// Muster = Endkunde. Die schmale Nur-Listen-Projektion aus Pass 1 wächst
// hier additiv um Detail/Anlegen.) -----------------------------------------
export type AnschlussnutzerListItem = components['schemas']['AnschlussnutzerListItem'];
export type AnschlussnutzerListe = components['schemas']['AnschlussnutzerListe'];
export type AnschlussnutzerPii = components['schemas']['AnschlussnutzerPii'];
export type AnschlussnutzerDetail = components['schemas']['AnschlussnutzerDetail'];
export type AnschlussnutzerAnlegen = components['schemas']['AnschlussnutzerAnlegen'];

// --- Messkonzept (versionierte Sub-Ressource unter Endkunde, Phase 4c Pass 2,
// append-only — KEIN Ändern/Löschen) ---------------------------------------
export type MesskonzeptTyp = components['schemas']['MesskonzeptTyp'];
export type EnergietraegerBaseline = components['schemas']['EnergietraegerBaseline'];
export type MesskonzeptVersionListItem = components['schemas']['MesskonzeptVersionListItem'];
export type MesskonzeptVersionListe = components['schemas']['MesskonzeptVersionListe'];
export type MesskonzeptVersionDetail = components['schemas']['MesskonzeptVersionDetail'];
export type EnergietraegerBaselineDetail = components['schemas']['EnergietraegerBaselineDetail'];
export type Systemgrenze = components['schemas']['Systemgrenze'];
export type SystemgrenzeSystem = components['schemas']['SystemgrenzeSystem'];
export type BaselineEinheit = components['schemas']['BaselineEinheit'];
export type BaselinePeriode = components['schemas']['BaselinePeriode'];
export type BaselinePerioden = components['schemas']['BaselinePerioden'];
export type BaselinePeriodeSetzen = components['schemas']['BaselinePeriodeSetzen'];
export type MesskonzeptVersionAnlegen = components['schemas']['MesskonzeptVersionAnlegen'];

// --- Monitoring/Vollständigkeit (DE-02, Phase 4c Pass 2 — nur Metadaten,
// KEINE PII/Verbrauchsfelder) ----------------------------------------------
export type LueckenTyp = components['schemas']['LueckenTyp'];
export type VollstaendigkeitItem = components['schemas']['VollstaendigkeitItem'];
export type VollstaendigkeitListe = components['schemas']['VollstaendigkeitListe'];

// --- Standort/Gebäudestruktur (ADR-0010) — `read:standort` (Struktur,
// PII-frei) UND `read:standort_pii` (Batch-Label-Lesestufe) sind bewusst
// GETRENNTE Typen (D5) — `StandortStruktur` trägt NIEMALS Bezeichnung/
// Adresse, `StandortLabelItem`/`StandortPiiDetail` NIEMALS Struktur-Felder. --
export type StandortTyp = components['schemas']['StandortTyp'];
export type StandortStatus = components['schemas']['StandortStatus'];
export type StandortStilllegenGrund = components['schemas']['StandortStilllegenGrund'];
export type StandortStruktur = components['schemas']['StandortStruktur'];
export type StandortAnlegen = components['schemas']['StandortAnlegen'];
export type StandortAendern = components['schemas']['StandortAendern'];
export type StandortPiiAendern = components['schemas']['StandortPiiAendern'];
export type StandortPiiDetail = components['schemas']['StandortPiiDetail'];
export type StandortLabelItem = components['schemas']['StandortLabelItem'];
export type StandortVerschieben = components['schemas']['StandortVerschieben'];
export type StandortVerschobenErgebnis = components['schemas']['StandortVerschobenErgebnis'];
export type StandortStilllegen = components['schemas']['StandortStilllegen'];
export type StandortStillgelegtErgebnis = components['schemas']['StandortStillgelegtErgebnis'];
export type StandortLoeschErgebnis = components['schemas']['StandortLoeschErgebnis'];
export type ZaehlerVerortungAnlegen = components['schemas']['ZaehlerVerortungAnlegen'];
export type ZaehlerVerortungBeenden = components['schemas']['ZaehlerVerortungBeenden'];
export type ZaehlerStandortDetail = components['schemas']['ZaehlerStandortDetail'];
export type ZaehlerUnterKnotenItem = components['schemas']['ZaehlerUnterKnotenItem'];
// `GET /stammdaten/zaehler/{zaehlerId}/verortung` (D6 — Breadcrumb-Pfad, PII-frei,
// Betriebs-UI-Konzept Punkt 3) — Labels werden GETRENNT über den bestehenden
// Batch-Endpunkt (`StandortLabelItem` oben) geholt, NIEMALS hier.
export type StandortPfadEintrag = components['schemas']['StandortPfadEintrag'];
export type ZaehlerStandortAktuellDetail = components['schemas']['ZaehlerStandortAktuellDetail'];

// --- Monitoring/TB-04 (`/monitoring/ausfaelle`) + Zähler-Freshness
// (`/stammdaten/zaehler/{zaehlerId}/freshness`) — Betriebs-UI-Konzept Punkt 1/3,
// beide PII-frei, KEIN break-glass (Betriebs-Metadaten). ------------------------
export type AusfallVorgangStatus = components['schemas']['AusfallVorgangStatus'];
export type AusfallListeItem = components['schemas']['AusfallListeItem'];
export type AusfallListe = components['schemas']['AusfallListe'];
export type MesskanalFreshnessItem = components['schemas']['MesskanalFreshnessItem'];
/** ADR-0011 B2/D3 — Herkunfts-Zuordnung (Netzserver-Kennung -> EDMS-Standort). */
export type HerkunftMapping = components['schemas']['HerkunftMapping'];
export type HerkunftMappingAnlegen = components['schemas']['HerkunftMappingAnlegen'];

export type IngestQuarantaeneGrund = components['schemas']['IngestQuarantaeneGrund'];
export type IngestQuarantaeneGrundAnzahl = components['schemas']['IngestQuarantaeneGrundAnzahl'];
export type IngestQuelle = components['schemas']['IngestQuelle'];
export type IngestStatus = components['schemas']['IngestStatus'];
export type IngestQuarantaeneItem = components['schemas']['IngestQuarantaeneItem'];
/**
 * Die GEPFLEGTE Konfiguration einer Datenquelle (V0059) — nicht zu verwechseln
 * mit `IngestQuelle`, dem Laufzeit-Zustand, den der Worker selbst meldet. Die
 * beiden Namen liegen dicht beieinander, weil die Sachen es auch tun: Was hier
 * gepflegt wird, meldet der Worker dort zurueck.
 */
export type IngestQuelleKonfig = components['schemas']['IngestQuelleKonfig'];
export type IngestQuelleAnlegen = components['schemas']['IngestQuelleAnlegen'];
export type IngestQuelleAendern = components['schemas']['IngestQuelleAendern'];
export type TlsModus = components['schemas']['TlsModus'];
export type IngestQuelleGeheimnisFeld = components['schemas']['IngestQuelleGeheimnisFeld'];
export type IngestQuarantaeneListe = components['schemas']['IngestQuarantaeneListe'];

// --- Einflussgrößen (ADR-0006 Teil B, B8/B10 — einfluss.katalog/intervall/
// befund, V0020/V0021). `read:einflussgroesse` ist eine Klartext-PII-
// Lesestufe (`EinflussgroesseDetail.wertNum`/`wertCode`, pii=true) — anders
// als die übrigen Stammdaten-Entitäten NICHT maskiert, s.
// `features/stammdaten/hooks/einflussgroesse/`-Dokumentation. -----------------
export type EinflussBetroffenerTyp = components['schemas']['EinflussBetroffenerTyp'];
export type EinflussQuelleTyp = components['schemas']['EinflussQuelleTyp'];
export type EinflussRechtsgrundlage = components['schemas']['EinflussRechtsgrundlage'];
export type EinflussAnlassCode = components['schemas']['EinflussAnlassCode'];
export type EinflussUeberschreitungKlasse = components['schemas']['EinflussUeberschreitungKlasse'];
export type EinflussgroesseErfassen = components['schemas']['EinflussgroesseErfassen'];
export type EinflussgroesseKorrekturWerte = components['schemas']['EinflussgroesseKorrekturWerte'];
export type EinflussgroesseKorrigieren = components['schemas']['EinflussgroesseKorrigieren'];
export type EinflussgroesseDetail = components['schemas']['EinflussgroesseDetail'];
export type EinflussgroesseKorrekturErgebnis = components['schemas']['EinflussgroesseKorrekturErgebnis'];
// `EinflussgroesseBefundItem` ist NICHT re-exportiert — TB-03-Befunde
// (`GET .../einflussgroessen/befunde`) sind v1 bewusst NICHT gebaut (immer
// leer, Schwellwert-Erkennung fehlt, s. Arbeitsauftrag/finale Antwort).
