-- V0057 — Audit-Ereignistypen der Geräteerkennung (TB-05, [Q3] Kap. 5).
--
-- DREI EREIGNISSE, ALLE PFLICHT
--
-- Anders als bei der Nutzerinformation, wo der Erzeugungslauf eine reine
-- Ableitung ist, verändert hier JEDER Vorgang die Zahl, mit der gegenüber der
-- Bewilligungsbehörde nachgewiesen wird, dass 20 bis 40 Prozent des
-- Jahresverbrauchs zugeordnet werden können.
--
-- Eine Zuordnung anzulegen hebt die Quote. Sie zu beenden senkt sie. Und die
-- Entbehrlichkeit zu vermerken nimmt ein System aus der Wertung. Alle drei
-- sind damit Vorgänge, deren Fehlen im Log ein Nachweisproblem wäre — nicht
-- Verwaltungsvorgänge.
--
-- BESONDERS DIE ENTBEHRLICHKEIT. Sie ist der Vorgang mit dem größten
-- Missbrauchspotenzial des ganzen Moduls: ein Häkchen, das eine Auflage für
-- ein System als „pauschal erfüllt" erklärt. Wer es setzt, muss benannt sein,
-- und der Grund gehört mit ins Protokoll — er ist die eigentliche Aussage.
--
-- KONTEXT-WHITELIST -- und was bewusst fehlt:
-- Keine Endkunden-Kennung und keine Verbrauchswerte. `objekt_ref` führt zur
-- Zuordnung bzw. zum System, und von dort ist alles auffindbar; im Log wären
-- es personenbeziehbare Daten in einer breit gelesenen Hypertable.
-- `methode`, `im_gesamtverbrauch_enthalten` und `genauigkeit_pct` sind
-- kategorial bzw. technisch und bleiben: Sie sagen, WIE zugeordnet wurde, und
-- genau danach fragt Kap. 5.
--
-- Review-Bedarf: `audit-trail-engineer`, `device-recognition-engineer`,
-- `compliance-director` (Entbehrlichkeit).

INSERT INTO audit.event_typ (code) VALUES
    ('geraetegruppe.zuordnung.angelegt'),
    ('geraetegruppe.zuordnung.beendet'),
    ('system.geraeteerkennung.entbehrlich_vermerkt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'geraetegruppe.zuordnung.angelegt', 'geraetegruppe_zuordnung', 'zuordnen',
     ARRAY['synthetic','methode','im_gesamtverbrauch_enthalten','genauigkeit_pct','anteil_prozent'],
     true, true, true,
     'Ein Messkanal wurde einer Geraete-/Anlagengruppe zugeordnet (TB-05, [Q3] Kap. 5). objekt_ref=energy.geraetegruppe.id. Der Vorgang HEBT die Zuordnungsquote, mit der nachgewiesen wird, dass 20 bis 40 Prozent des Jahresverbrauchs zugeordnet werden koennen -- er ist damit nachweisrelevant, kein Verwaltungsvorgang. kontext.methode=direktmessung|algorithmus|vorschaltgeraet|sonstige und kontext.genauigkeit_pct sind die beiden Angaben, die Kap. 5 ausdruecklich verlangt; kontext.im_gesamtverbrauch_enthalten sagt, ob der Kanal eine Untermessung ist -- ohne diese Angabe ist die Quote nicht rechenbar. BEWUSST OHNE Endkunden-Kennung und Verbrauchswerte: ueber objekt_ref auffindbar. pflichtereignis=true.',
     now()),
    (gen_random_uuid(), 'geraetegruppe.zuordnung.beendet', 'geraetegruppe_zuordnung', 'beenden',
     ARRAY['synthetic','methode'],
     true, true, true,
     'Eine Zuordnung wurde beendet (TB-05). objekt_ref=energy.geraetegruppe.id. Der Vorgang SENKT die Zuordnungsquote und ist deshalb ebenso protokollpflichtig wie das Anlegen -- von beiden Richtungen ist die senkende die, die spaeter erklaert werden muss. Die Zeile bleibt erhalten und traegt ihren Grund; geloescht wird nichts, sonst waere auch der Nachweis der Zeit weg, in der die Zuordnung galt. Schmalerer Kontext als beim Anlegen: Genauigkeit und Topologie stehen bereits am Anlege-Ereignis derselben objekt_ref.',
     now()),
    (gen_random_uuid(), 'system.geraeteerkennung.entbehrlich_vermerkt', 'system', 'vermerken',
     ARRAY['synthetic','entbehrlich'],
     true, true, true,
     'Fuer ein System wurde vermerkt, dass eine Geraeteerkennung nicht sinnvoll ist und die Anforderungen damit pauschal als erfuellt gelten ([Q3] Kap. 5, woertlich). objekt_ref=energy.system.id. DER VORGANG MIT DEM GROESSTEN MISSBRAUCHSPOTENZIAL DIESES MODULS: ein Haekchen, das eine Foerderauflage fuer ein System als erfuellt erklaert. Wer es setzt, muss benannt sein. kontext.entbehrlich=true|false -- die Ruecknahme ist derselbe Ereignistyp, weil sie derselbe Vorgang in die andere Richtung ist. Der GRUND steht bewusst NICHT im Kontext: Er ist Freitext und koennte einen Namen tragen; er liegt in energy.system und ist ueber objekt_ref auffindbar. pflichtereignis=true.',
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
-- V0036, V0038, V0043, V0045, V0048, V0053, V0055 und V0057 sind dabei
-- GEMEINSAM zu behandeln.
