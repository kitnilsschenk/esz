-- V0055 — Audit-Ereignistypen der monatlichen Nutzerinformation (TB-06).
--
-- ZWEI EREIGNISSE MIT SEHR VERSCHIEDENEM GEWICHT
--
-- `erzeugt` ist ein AGGREGAT je Lauf, nicht je Endkunde: Ein Monatslauf ueber
-- tausend Kunden wuerde sonst mehr ins append-only Log schreiben als der
-- Betrieb davor. Dieselbe Begruendung wie beim Retention-Lauf (V0048).
-- pflichtereignis=false — der Lauf erzeugt eine Ableitung, er beruehrt keine
-- Rechtsposition.
--
-- `zugestellt` ist ein Ereignis JE INFORMATION und PFLICHT. Es ist der
-- Nachweis, den TB-06 verlangt („Versand-/Bereitstellungs-Nachweis"), und die
-- Aussage, auf die es ankommt, ist eine Aussage ueber EINEN Kunden: Wurde
-- DIESER Endkunde in DIESEM Monat informiert? Eine Aggregatzahl beantwortet
-- das nicht — und im Streitfall ist genau das die Frage.
--
-- KONTEXT-WHITELIST -- und was bewusst fehlt:
-- Keine Kennung des Endkunden, kein Verbrauchswert, kein Einsparbetrag.
-- `objekt_ref` fuehrt zur Information, und von dort ist alles auffindbar; im
-- Audit-Log waeren es personenbeziehbare Verbrauchsdaten in einer breit
-- gelesenen Hypertable, die der Krypto-Shred nicht erreicht. `monat` ist
-- kategorial und bleibt.
--
-- Review-Bedarf: `audit-trail-engineer`, `compliance-director`,
-- `product-director` (Auflagen-Nachweis).

INSERT INTO audit.event_typ (code) VALUES
    ('nutzerinfo.information.erzeugt'),
    ('nutzerinfo.information.zugestellt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'nutzerinfo.information.erzeugt', 'nutzerinfo_lauf', 'erzeugen',
     ARRAY['synthetic','monat','modus','anzahl_erzeugt','anzahl_uebersprungen_widerspruch','anzahl_uebersprungen_gesperrt','anzahl_ohne_berechnung'],
     true, false, true,
     'Ein Erzeugungslauf der monatlichen Nutzerinformation (TB-06, [Q3] Kap. 6). AGGREGAT je Lauf, NICHT je Endkunde -- ein Monatslauf ueber tausend Kunden wuerde sonst mehr ins Log schreiben als der Betrieb davor (Muster V0048). kontext.modus=probelauf|ausfuehrung. Die drei Uebersprungen-Zahlen sind der eigentliche Wert dieses Ereignisses: Sie machen sichtbar, WARUM ein Kunde nicht informiert wurde -- Widerspruch (Opt-out, zulaessig), Sperrung nach Art. 18 (zulaessig) oder FEHLENDE BERECHNUNG (ein Befund, der die Auflage verletzt). Ohne diese Trennung waere ein leerer Lauf von einem blockierten nicht zu unterscheiden. pflichtereignis=false -- der Lauf erzeugt eine Ableitung und beruehrt keine Rechtsposition.',
     now()),
    (gen_random_uuid(), 'nutzerinfo.information.zugestellt', 'nutzerinfo_information', 'mitteilen',
     ARRAY['synthetic','monat','zustellweg'],
     true, true, true,
     'Eine monatliche Nutzerinformation wurde zugestellt bzw. bereitgestellt (TB-06 Versand-/Bereitstellungsnachweis). objekt_ref=nutzerinfo.information.id. JE INFORMATION, nicht je Lauf: Die Frage, auf die es ankommt, ist eine ueber EINEN Kunden -- wurde DIESER Endkunde in DIESEM Monat informiert? Eine Aggregatzahl beantwortet das nicht. BEWUSST OHNE Endkunden-Kennung, Verbrauchswert und Einsparbetrag: ueber objekt_ref auffindbar, im Log waeren es personenbeziehbare Verbrauchsdaten. pflichtereignis=true -- das Ereignis IST der Auflagen-Nachweis; sein Fehlen ist gegenueber der Bewilligungsbehoerde ein Auflagenverstoss.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen (rote Linie 1). Der
-- Emitter entsteht im selben Commit.
--
-- VERBINDLICHER HINWEIS, unveraendert fortgeschrieben: A11.5 verlangt das
-- Katalog-Ereignis. Es ist VERSCHOBEN, nicht erledigt -- mit echtem Principal
-- nachzutragen, spaetestens bei Oeffnung des ADR-0004-Gates. V0032, V0033,
-- V0036, V0038, V0043, V0045, V0048, V0053 und V0055 sind dabei GEMEINSAM zu
-- behandeln.
