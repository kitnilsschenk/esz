import { describe, expect, it } from 'vitest';
import { ZERTIFIKAT_WARNUNG_TAGE, zertifikatAnzeige } from './useIngestQuellenView';

/**
 * Die Bewertung des Zertifikats-Ablaufs — reine Funktion, deshalb hier ohne
 * Renderer geprüft.
 *
 * Der Prüfzeitpunkt wird ÜBERGEBEN statt aus `new Date()` gelesen. Ein Test,
 * der die Systemzeit benutzt, prüft an einem Grenztag etwas anderes als an
 * einem anderen — und genau an den Grenzen liegt hier die Aussage.
 */
describe('Zertifikats-Anzeige', () => {
  const JETZT = new Date('2026-09-08T12:00:00.000Z');

  function inTagen(tage: number): string {
    return new Date(JETZT.getTime() + tage * 86_400_000).toISOString();
  }

  it('sagt nichts, wenn kein Zertifikat hinterlegt ist', () => {
    // Nicht „unbegrenzt gültig" und kein „—": Wo es gar kein Zertifikat geben
    // muss, ist eine Zelle mit Inhalt nur Rauschen.
    const anzeige = zertifikatAnzeige([null, null], JETZT);

    expect(anzeige.zertifikatLabel).toBe('');
    expect(anzeige.zertifikatWarnt).toBe(false);
  });

  it('meldet ein abgelaufenes Zertifikat als Fehler, nicht als Warnung', () => {
    // Abgelaufen heisst: Der Broker verweigert die Verbindung. Das ist kein
    // „demnaechst", sondern ein bestehender Ausfall.
    const anzeige = zertifikatAnzeige([inTagen(-1), null], JETZT);

    expect(anzeige.zertifikatBadgeVariante).toBe('destructive');
    expect(anzeige.zertifikatWarnt).toBe(true);
    expect(anzeige.zertifikatLabel).toMatch(/Abgelaufen/);
  });

  it('warnt innerhalb der Vorlauffrist und nennt die verbleibenden Tage', () => {
    // „Laeuft bald ab" allein sagt nicht, ob es um morgen oder vier Wochen
    // geht — die Zahl entscheidet, ob heute jemand handeln muss.
    const anzeige = zertifikatAnzeige([inTagen(5), null], JETZT);

    expect(anzeige.zertifikatBadgeVariante).toBe('warning');
    expect(anzeige.zertifikatWarnt).toBe(true);
    expect(anzeige.zertifikatLabel).toMatch(/5 Tagen/);
  });

  it('warnt noch am letzten Tag der Vorlauffrist', () => {
    const anzeige = zertifikatAnzeige([inTagen(ZERTIFIKAT_WARNUNG_TAGE), null], JETZT);

    expect(anzeige.zertifikatWarnt).toBe(true);
  });

  it('richtet sich nach dem FRUEHESTEN Ablauf beider Zertifikate', () => {
    // Zuerst wurde hier nur das Client-Zertifikat bewertet — ein Denkfehler:
    // Laeuft das CA-Zertifikat ab, bricht die Vertrauenskette zum Broker
    // genauso, und die Verbindung kommt genauso wenig zustande.
    const anzeige = zertifikatAnzeige([inTagen(200), inTagen(3)], JETZT);

    expect(anzeige.zertifikatWarnt).toBe(true);
    expect(anzeige.zertifikatLabel).toMatch(/3 Tagen/);
  });

  it('warnt NICHT, solange mehr Zeit bleibt als die Vorlauffrist', () => {
    // Eine Warnung, die dauernd steht, liest irgendwann niemand mehr.
    const anzeige = zertifikatAnzeige([inTagen(ZERTIFIKAT_WARNUNG_TAGE + 1), null], JETZT);

    expect(anzeige.zertifikatBadgeVariante).toBe('success');
    expect(anzeige.zertifikatWarnt).toBe(false);
    expect(anzeige.zertifikatLabel).toMatch(/Gültig bis/);
  });
});
