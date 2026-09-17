-- V0053 — Audit-Ereignistypen fuer den Widerspruch (AW-27).
--
-- Zwei Ereignisse, beide PFLICHT. Sie stehen auf derselben Stufe wie
-- `einwilligung.consent.erteilt`/`.widerrufen` aus V0045, und aus demselben
-- Grund: Ohne sie ist nicht zu fuehren, dass eine Erklaerung der betroffenen
-- Person vorlag und ab wann sie wirkte.
--
-- Der Widerspruch traegt dabei eine Besonderheit, die die Einwilligung nicht
-- hat: Er hat FOLGEN IM STAMMDATENBESTAND. Fuer `wiss_auswertung` setzt der
-- Vorgang `energy.<subjekt>.von_wiss_auswertung_ausgenommen`, und dieses
-- Attribut steuert Export- und Auswertungsfilter. Ein Bestandsmerkmal, das
-- sich ohne Spur aendern kann, ist ein Merkmal, dem niemand trauen muss --
-- deshalb ist auch die Ruecknahme pflichtprotokolliert und nicht nur die
-- Erklaerung.
--
-- KONTEXT-WHITELIST -- und was bewusst fehlt:
-- `zweck_code` und `subjekt_typ` sind kategorial und tragen keinen
-- Personenbezug. Die Subjekt-Kennung steht NICHT im Kontext: Sie ist ueber
-- `objekt_ref` auffindbar (dieselbe Linie wie V0045). `quelle_ref` fehlt
-- ebenfalls -- die Fundstelle eines Dokuments kann einen Namen enthalten
-- ("Schreiben Mueller vom ..."), und das Audit-Log ist eine breit gelesene
-- Hypertable, die der Krypto-Shred nicht erreicht.
--
-- Review-Bedarf: `audit-trail-engineer`, `compliance-director`.

INSERT INTO audit.event_typ (code) VALUES
    ('widerspruch.consent.erklaert'),
    ('widerspruch.consent.zurueckgenommen');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'widerspruch.consent.erklaert', 'widerspruch', 'erfassen',
     ARRAY['synthetic','zweck_code','subjekt_typ','erlaubnismodus','erfassungsweg'],
     true, true, true,
     'Eine betroffene Person hat einer Verarbeitung widersprochen, die OHNE Einwilligung laeuft (AW-27, Votum 2026-09-07 V-11d). objekt_ref=consent.widerspruch.id. Zwei Faelle: die monatliche Nutzerinformation (TB-06 Opt-out) und die wissenschaftliche Auswertung (DE-04). Fuer den zweiten setzt der Vorgang energy.<subjekt>.von_wiss_auswertung_ausgenommen -- das Attribut bleibt die einzige Durchsetzungsstelle, aber es wird ausschliesslich hierueber gesetzt, nie von Hand. kontext.erfassungsweg ist kategorial; die Fundstelle (quelle_ref) steht BEWUSST NICHT im Kontext, weil sie einen Namen enthalten kann. pflichtereignis=true -- ohne dieses Ereignis ist nicht zu fuehren, ab wann nicht mehr verarbeitet werden durfte.',
     now()),
    (gen_random_uuid(), 'widerspruch.consent.zurueckgenommen', 'widerspruch', 'beenden',
     ARRAY['synthetic','zweck_code','subjekt_typ'],
     true, true, true,
     'Ein Widerspruch wurde von der betroffenen Person zurueckgenommen (AW-27). objekt_ref=consent.widerspruch.id. Die Wirkung endet AB der Ruecknahme; die Zeile bleibt erhalten, weil sonst auch der Nachweis der Zeit verschwaende, in der widersprochen war. Schmalerer Kontext als bei der Erklaerung: Erlaubnismodus und Erfassungsweg der Erklaerung stehen bereits am Erklaerungs-Ereignis derselben objekt_ref. pflichtereignis=true -- die Ruecknahme laesst eine Verarbeitung WIEDER anlaufen und setzt bei wiss_auswertung ein Bestandsmerkmal zurueck; ein solcher Vorgang ohne Spur waere der gefaehrlichere der beiden.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen (rote Linie 1). Der
-- Emitter fuer die beiden Ereignisse oben entsteht im selben Commit.
--
-- VERBINDLICHER HINWEIS, unveraendert aus V0048 uebernommen: A11.5 verlangt
-- das Katalog-Ereignis. Es ist VERSCHOBEN, nicht erledigt -- mit echtem
-- Principal nachzutragen, spaetestens bei Oeffnung des ADR-0004-Gates.
-- V0032, V0033, V0036, V0038, V0043, V0045, V0048 und V0053 sind dabei
-- GEMEINSAM zu behandeln.
