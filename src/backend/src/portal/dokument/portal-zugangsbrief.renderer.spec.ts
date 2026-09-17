import { describe, expect, it } from 'vitest';
import { rendereZugangsbrief, type ZugangsbriefEingang } from './portal-zugangsbrief.renderer';

const EINGANG: ZugangsbriefEingang = {
  kennung: 'EK-A3K7QP',
  code: 'ABCD-EFGH-JKMN',
  gueltigBis: '2026-10-09T12:00:00.000Z',
  portalUrl: 'https://portal.example.org',
  erneut: false,
};

describe('rendereZugangsbrief', () => {
  it('traegt Kennung, Code und Adresse — die drei Angaben, ohne die der Brief nutzlos ist', () => {
    const html = rendereZugangsbrief(EINGANG);

    expect(html).toContain('EK-A3K7QP');
    expect(html).toContain('ABCD-EFGH-JKMN');
    expect(html).toContain('https://portal.example.org');
  });

  it('nennt die Gueltigkeit als deutsches Datum', () => {
    expect(rendereZugangsbrief(EINGANG)).toContain('09.10.2026');
  });

  it('sagt, dass der Code nicht erneut mitgeteilt werden kann', () => {
    // Ohne diesen Satz hebt niemand den Brief auf — und ruft dann an.
    expect(rendereZugangsbrief(EINGANG)).toContain('nicht gespeichert und kann Ihnen nicht erneut mitgeteilt werden');
  });

  it('weist im Ersatzbrief darauf hin, dass der alte Code nicht mehr gilt', () => {
    const html = rendereZugangsbrief({ ...EINGANG, erneut: true });

    expect(html).toContain('Ersatzbrief');
    expect(html).toContain('gilt ab sofort nicht mehr');
  });

  it('nennt den Ersatzbrief-Hinweis NICHT beim ersten Brief', () => {
    expect(rendereZugangsbrief(EINGANG)).not.toContain('Ersatzbrief');
  });

  it('nennt den Weg zum Opt-out — das Portal ist auch der Widerspruchsweg', () => {
    expect(rendereZugangsbrief(EINGANG)).toContain('widersprechen');
  });

  it('ist eigenstaendig: kein Skript, kein externer Verweis', () => {
    // Ein Brief, der beim Oeffnen nachlaedt, verraet dem Betreiber der
    // geladenen Ressource, wann und wo er geoeffnet wurde.
    const html = rendereZugangsbrief(EINGANG);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/src\s*=/);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toContain('@import');
  });

  it('ist deterministisch', () => {
    expect(rendereZugangsbrief(EINGANG)).toBe(rendereZugangsbrief(EINGANG));
  });

  it('maskiert Sonderzeichen aus der konfigurierten Adresse', () => {
    // Die URL kommt aus der Umgebung; eine falsch gesetzte darf den Brief
    // nicht zu Markup machen.
    const html = rendereZugangsbrief({ ...EINGANG, portalUrl: 'https://x.example/"><b>hi</b>' });

    expect(html).not.toContain('<b>hi</b>');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
});
