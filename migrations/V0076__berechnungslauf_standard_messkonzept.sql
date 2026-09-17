-- =====================================================================
-- V0076 -- Standard-Messkonzept: angepasste Baseline-Koeffizienten und
--          ihre Guete am Berechnungslauf
-- =====================================================================
--
-- ANLASS
-- ------
-- Das Merkblatt Technik v2.2 kennt drei Messkonzepte (Kap. 2). Sie
-- unterscheiden sich nicht in der Genauigkeit, sondern darin, WOHER die
-- Baseline kommt:
--
--   * vereinfacht (Kap. 2.1.2) -- Mittelwert aus den letzten drei
--     Jahresabrechnungen des Versorgers. Normativ gesetzt, nichts angepasst.
--   * Standard (Kap. 2.2.2) -- "durch eine Vermessung des jeweiligen Systems
--     (Energieverbrauch, Einflussgroessen, Nutzen) zu erheben"; zusaetzlich:
--     "Es muessen mindestens Aussagen zum einflussunabhaengigen Anteil des
--     Verbrauchs getroffen werden."
--   * alternativ (Kap. 2.3) -- wie Standard, mit begruendeten Abweichungen.
--
-- `energy.messkonzept_version.typ` fuehrt diese drei Werte seit V0002. Die
-- Rechenmaschine hat sie bis hierher NIE GELESEN: jeder Lauf rechnete das
-- vereinfachte Verfahren, unabhaengig vom Etikett. Der Bestand steht
-- durchgaengig auf `standard` und wurde vereinfacht gerechnet -- kein
-- Rechenfehler (die Zahlen sind fuer das vereinfachte Verfahren korrekt),
-- aber eine Beschriftung, die im Nachweis nicht haelt.
--
-- =====================================================================
-- DER RECHENKERN AENDERT SICH NICHT
-- =====================================================================
-- Die Monatsreferenz hat seit B12.1 die lineare Form
--
--     R_m = a0 * (d_m / d_a)  +  b1 * GTZ_m
--
-- und beide Messkonzepte teilen sie sich. Sie unterscheiden sich allein in
-- der Herkunft der Koeffizienten:
--
--     vereinfacht:  a0 = g*B,  b1 = (1-g)*B / GTZ_base        (gesetzt)
--     Standard:     kwh_m = c*d_m + b1*GTZ_m, kleinste Quadrate (angepasst),
--                   danach a0 = c*d_a, B = a0 + b1*GTZ_base, g = a0/B
--
-- Der Standard-Pfad fuellt damit DIESELBEN Spalten (`baseline_wert_kwh`,
-- `grundlast_anteil`, `gtz_base`) und durchlaeuft DIESELBE Funktion
-- (`referenzMonat()`, golden-vector-versiegelt). Deshalb braucht diese
-- Migration KEINE Koeffizientenspalten: a0 und b1 sind aus den vorhandenen
-- Spalten exakt rekonstruierbar. Zwei Rechenkerne waeren zwei
-- Erklaerungsgegenstaende gegenueber der Bewilligungsbehoerde und zwei
-- Fehlerquellen.
--
-- Angepasst wird OHNE Achsenabschnitt, mit den Kalendertagen als eigenem
-- Regressor -- sonst unterstellte das Modell, jeder Monat sei gleich lang,
-- und bevorzugte bei 28 bis 31 Tagen systematisch die kurzen.
--
-- =====================================================================
-- WAS NEU GESPEICHERT WIRD
-- =====================================================================
-- Nur das, was sich NICHT aus den Bestandsspalten ergibt:
--
--   * `messkonzept_typ` -- welches Verfahren der Lauf TATSAECHLICH gerechnet
--     hat. Nicht als Join auf `messkonzept_version` aufloesbar: das Etikett
--     dort kann sich spaeter aendern, der Lauf muss seinen eigenen Stand
--     behalten (dieselbe Logik wie `station_ref` und `verfahren_version`).
--   * die vier Guetemasse der Anpassung. Sie existieren nur im
--     Standard-/alternativ-Fall; beim vereinfachten Verfahren wurde nichts
--     angepasst, und eine Zahl dort waere die Behauptung einer Guete, die nie
--     gemessen wurde.
--   * `baseline_abweichung_pct` -- Abstand der angepassten Jahres-Baseline
--     von der nach TB-02 ERFASSTEN. Laufen beide auseinander, ist das ein
--     Befund und kein Abbruchgrund: die erfasste Baseline bleibt der Beleg,
--     die angepasste das Modell. Wer sie stillschweigend ersetzte, verloere
--     die Spur zum Beleg.
--
-- Das DEFAULT 'vereinfacht' etikettiert die Bestandslaeufe. Das ist sachlich
-- richtig -- sie WURDEN so gerechnet, gleich was an ihrem Messkonzept steht.
--
-- Review-Bedarf: `baseline-engineer` (Modellform, Mindestpunktzahl,
-- Streuungsschranke), `database-lead` (Spalten/Constraints),
-- `bafa-export-engineer` (Ausweis der Guete im Nachweis).

-- =====================================================================
-- (1) Spalten am Lauf
-- =====================================================================

ALTER TABLE analytics.berechnungslauf
    ADD COLUMN messkonzept_typ         text NOT NULL DEFAULT 'vereinfacht',
    ADD COLUMN guete_r2                numeric(6,4),
    ADD COLUMN guete_cv_rmse_pct       numeric(7,2),
    ADD COLUMN guete_nmbe_pct          numeric(7,2),
    ADD COLUMN guete_punkte            smallint,
    ADD COLUMN baseline_abweichung_pct numeric(7,2);

ALTER TABLE analytics.berechnungslauf
    ADD CONSTRAINT ck_berechnungslauf_messkonzept_typ
        CHECK (messkonzept_typ IN ('vereinfacht', 'standard', 'alternativ')),

    -- Die vier Guetemasse gehoeren zusammen: R2 ohne die Zahl der Punkte, auf
    -- denen es beruht, ist nicht bewertbar (ein R2 aus drei Monaten sagt
    -- etwas anderes als eines aus zwoelf). Entweder alle oder keines.
    ADD CONSTRAINT ck_berechnungslauf_guete_vollstaendig
        CHECK (
            (guete_r2 IS NULL AND guete_cv_rmse_pct IS NULL AND guete_nmbe_pct IS NULL AND guete_punkte IS NULL)
         OR (guete_r2 IS NOT NULL AND guete_cv_rmse_pct IS NOT NULL AND guete_nmbe_pct IS NOT NULL AND guete_punkte IS NOT NULL)
        ),

    -- Beim vereinfachten Verfahren wurde nichts angepasst. Eine Guete dort
    -- waere frei erfunden -- die Datenbank laesst sie gar nicht erst zu.
    ADD CONSTRAINT ck_berechnungslauf_guete_nur_bei_anpassung
        CHECK (messkonzept_typ <> 'vereinfacht' OR guete_r2 IS NULL),

    -- R2 nach oben durch 1 begrenzt; nach UNTEN bewusst NICHT: ein Modell,
    -- das schlechter trifft als der blosse Mittelwert, ergibt ein negatives
    -- R2. Das ist eine Aussage ueber das Modell und muss speicherbar bleiben.
    ADD CONSTRAINT ck_berechnungslauf_guete_r2_obergrenze
        CHECK (guete_r2 IS NULL OR guete_r2 <= 1),
    ADD CONSTRAINT ck_berechnungslauf_guete_cv_rmse
        CHECK (guete_cv_rmse_pct IS NULL OR guete_cv_rmse_pct >= 0),
    ADD CONSTRAINT ck_berechnungslauf_guete_punkte
        CHECK (guete_punkte IS NULL OR guete_punkte >= 1);

COMMENT ON COLUMN analytics.berechnungslauf.messkonzept_typ IS
  'pii=false; Messkonzept-Typ, mit dem DIESER Lauf tatsaechlich gerechnet hat (Merkblatt Technik v2.2 Kap. 2): vereinfacht = normativ gesetzte Koeffizienten aus erfasster Baseline und Grundlast-Anteil; standard/alternativ = an die vermessene Baseline-Periode angepasst. Eingefroren wie station_ref -- das Etikett an energy.messkonzept_version kann sich spaeter aendern, der Lauf behaelt seinen Stand.';

COMMENT ON COLUMN analytics.berechnungslauf.guete_r2 IS
  'pii=false; Bestimmtheitsmass der Baseline-Anpassung, ZENTRIERT definiert (1 - SSE/SST um den Mittelwert). Fuer ein Modell ohne Achsenabschnitt ist auch die unzentrierte Variante gebraeuchlich -- sie faellt systematisch hoeher aus und schmeichelt dem Modell, deshalb die zentrierte. NULL beim vereinfachten Verfahren (nichts angepasst). Darf negativ sein.';

COMMENT ON COLUMN analytics.berechnungslauf.guete_cv_rmse_pct IS
  'pii=false; CV(RMSE) der Anpassung in Prozent des Monatsmittels -- die typische relative Abweichung. Steht neben R2, weil ein hohes R2 bei Waerme schon aus dem Sommer-Winter-Kontrast allein entstehen kann.';

COMMENT ON COLUMN analytics.berechnungslauf.guete_nmbe_pct IS
  'pii=false; NMBE der Anpassung in Prozent der Gesamtmenge (systematischer Versatz). Dass er nahe null liegt, ist KEINE Guete -- kleinste Quadrate erzwingen es fast. Er steht dabei, weil eine FEHLENDE Null mehr ueber einen Datenfehler verriete als ihr Vorhandensein ueber das Modell.';

COMMENT ON COLUMN analytics.berechnungslauf.guete_punkte IS
  'pii=false; n -- Zahl der Monatspunkte der Vermessung, auf denen die Anpassung beruht. Ohne n ist R2 nicht bewertbar.';

COMMENT ON COLUMN analytics.berechnungslauf.baseline_abweichung_pct IS
  'pii=false; Abstand der ANGEPASSTEN Jahres-Baseline von der nach TB-02 ERFASSTEN, in Prozent der erfassten. Befund, kein Abbruchgrund: die erfasste Baseline bleibt der Beleg (Jahresabrechnung), die angepasste das Modell. NULL, wenn nicht angepasst wurde oder keine erfasste Baseline vorliegt.';

-- =====================================================================
-- (2) SCD2 auf dem Verfahrenskatalog: witterung_gtz_vdi3807 v1 -> v2
-- =====================================================================
-- Warum eine neue Version, obwohl die FORMEL unveraendert bleibt: Der
-- Standard-Pfad friert zusaetzlich die Messwerte der BASELINE-PERIODE mit ein
-- (bisher deckte der Messwert-Snapshot nur die Zielperiode ab). Damit aendert
-- sich der `rohdaten_hash` eines Standard-Laufs gegenueber dem, was v1
-- erzeugt haette. Ein Lauf muss an seiner Verfahrensversion ablesbar machen,
-- nach welcher Regel sein Siegel entstanden ist.
--
-- Die Golden Vectors werden UNVERAENDERT uebernommen. Sie fixieren
-- `referenzMonat()`/`baselineNormiert()`, und genau diese Funktionen bleiben
-- gleich -- der Bootstrap-Check (GoldenVectorBootstrapService) muss sie unter
-- v2 weiterhin bestehen. Waeren sie hier zu aendern, waere das der Beweis,
-- dass der Kern doch angefasst wurde.

DO $$
DECLARE
    v_code text := 'witterung_gtz_vdi3807';
    v_alt  analytics.verfahren_version%ROWTYPE;
BEGIN
    SELECT * INTO v_alt
      FROM analytics.verfahren_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY version DESC
     LIMIT 1;

    IF v_alt.id IS NULL THEN
        RAISE EXCEPTION 'analytics: keine offene (gueltig_bis IS NULL) Version fuer % -- Katalog in unerwartetem Zustand, Migration abgebrochen.', v_code;
    END IF;

    IF v_alt.version <> 1 THEN
        RAISE EXCEPTION 'analytics: offene Version von % ist %, erwartet 1 -- Migration abgebrochen (bereits angewendet oder Katalog seither veraendert?).', v_code, v_alt.version;
    END IF;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO analytics.verfahren_version
        (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
    VALUES (
        gen_random_uuid(), v_code, 2,
        $params$
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "urn:edms:analytics:verfahren:witterung_gtz_vdi3807:2",
          "type": "object",
          "additionalProperties": false,
          "required": ["t_innen_c", "t_heizgrenze_c", "tage_pro_jahr", "tages_zeitzone", "messkonzept_typ"],
          "properties": {
            "t_innen_c": {"type": "number", "default": 20, "einheit": "degC",
              "beschreibung": "Angenommene Innentemperatur (VDI-3807-Standardwert, B12.1)"},
            "t_heizgrenze_c": {"type": "number", "default": 15, "einheit": "degC",
              "beschreibung": "Heizgrenztemperatur (VDI-3807-Standardwert, B12.1)"},
            "tage_pro_jahr": {"type": "number", "default": 365.25, "einheit": "d",
              "beschreibung": "Tage pro (Baseline-)Jahr, Grundlast-Proration (Schaltjahr-Glaettung), B12.1"},
            "tages_zeitzone": {"type": "string", "default": "Europe/Berlin",
              "beschreibung": "Lokale Kalendertag-Zeitzone fuer die GTZ-Tagesbildung (D4), je Lauf eingefroren"},
            "normperiode": {"type": "string", "default": "1991-2020", "status": "fachlich_zu_bestaetigen",
              "beschreibung": "WMO-Referenzperiode fuer GTZ_norm -- NUR Ausweis (B_norm), geht NICHT in R_m/A_m ein (B12.1)"},
            "oel_heizwert_kwh_je_liter": {"type": "number", "default": 10.0, "einheit": "kWh/l", "status": "fachlich_zu_bestaetigen",
              "beschreibung": "Heizoel-EL-Literwert, nur bei energietraeger=oel (B12.1/B12.3)"},
            "messkonzept_typ": {"type": "string", "enum": ["vereinfacht", "standard", "alternativ"],
              "beschreibung": "NEU in v2: welcher Weg zu den Koeffizienten (a0, b1) gefuehrt hat. Die Monatsformel R_m = a0*(d_m/d_a) + b1*GTZ_m ist in beiden Faellen dieselbe."},
            "regression_mindest_punkte": {"type": "integer", "default": 6,
              "beschreibung": "NEU in v2: Mindestzahl an Monatspunkten der Vermessung. Das Merkblatt nennt keine Zahl (Kap. 2.2.2 fordert qualitativ hinreichende Variation); sechs Punkte auf zwei Parameter sind die untere Grenze der Belastbarkeit."},
            "regression_mindest_gtz_streuung": {"type": "number", "default": 0.05,
              "beschreibung": "NEU in v2: untere Schranke fuer (max-min)/max der Gradtagzahl ueber die Vermessung. Darunter ist der Witterungseinfluss rechnerisch nicht vom einflussunabhaengigen Anteil trennbar."}
          }
        }
        $params$::jsonb,
        (SELECT golden_vectors FROM analytics.verfahren_version WHERE id = v_alt.id),
        'Witterungsbereinigung nach VDI 3807, Version 2 (V0076). Die FORMEL ist unveraendert gegenueber v1 -- R_m = a0*(d_m/d_a) + b1*GTZ_m, dieselben Golden Vectors, derselbe Kern (domain/witterung-gtz.ts). NEU ist ausschliesslich ein ZWEITER WEG zu den Koeffizienten: beim Standard-/alternativen Messkonzept (Merkblatt Technik Kap. 2.2.2) werden a0 und b1 an die VERMESSENE Baseline-Periode angepasst (kleinste Quadrate auf kwh_m = c*d_m + b1*GTZ_m, ohne Achsenabschnitt, Kalendertage als eigener Regressor) statt aus erfasster Baseline und Grundlast-Anteil gesetzt zu werden. Das erfuellt die Vorgabe "mindestens Aussagen zum einflussunabhaengigen Anteil des Verbrauchs" mit einer gemessenen statt einer gesetzten Groesse und liefert eine belegbare Modellguete (R2, CV(RMSE), NMBE, n). Der Standard-Pfad friert zusaetzlich die Messwerte der Baseline-Periode ein -- daher eine neue Version, obwohl die Formel gleich bleibt: der rohdaten_hash entsteht nach einer anderen Regel. NICHT enthalten: Mehrgroessen-Regression und Nutzen als Einflussgroesse (ADR-0006 F1 (c)) -- dafuer existiert keine Datenquelle (analytics.eingang_einflussgroesse ist leer, eine energy-seitige Quelltabelle gibt es nicht).',
        true, now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen. Nachzutragen als
-- operativer Schritt mit echtem Principal.
