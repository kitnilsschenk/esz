import { describe, expect, it } from 'vitest';
import {
  energietraegerLabel,
  formatiereBigintAnzahl,
  formatiereFoerderjahrSpanne,
  formatiereFoerderjahrZeitraum,
  istNurPaarBezogenerBlocker,
  jahresQualitaetsStufeLabel,
  preflightSchwereBadgeVariante,
  regelCodeLabel,
} from './nachweisFormat';

describe('nachweisFormat', () => {
  it('zeigt den Förderjahr-Zeitraum mit INKLUSIVEM Endmonat', () => {
    // Anders als beim Berechnungslauf ist `bisMonat` hier inklusive. Würde
    // die Anzeige die Lauf-Konvention übernehmen, stünde durchgängig ein
    // Monat zu wenig da.
    expect(formatiereFoerderjahrZeitraum('2027-01-01', '2027-12-01')).toBe('Januar 2027 – Dezember 2027');
  });

  it('zieht einen Ein-Monats-Zeitraum zu einer Angabe zusammen', () => {
    expect(formatiereFoerderjahrZeitraum('2027-03-01', '2027-03-01')).toBe('März 2027');
  });

  it('übersetzt bekannte Prüfregeln in Klartext', () => {
    expect(regelCodeLabel('FJ-05')).toBe('Widersprüchliche Rechenhistorie');
  });

  it('zeigt einen unbekannten Regel-Code roh an, statt zu scheitern', () => {
    // `regelCode` ist in der Schnittstelle ein offener String — ein neuer
    // Katalog-Eintrag darf die Befundliste nicht zum Absturz bringen.
    expect(regelCodeLabel('FJ-99')).toBe('FJ-99');
  });

  it('erkennt Blocker, die nur ein Paar ausschließen', () => {
    expect(istNurPaarBezogenerBlocker('FJ-07c', 'blocker')).toBe(true);
    expect(istNurPaarBezogenerBlocker('FJ-11c', 'blocker')).toBe(true);
    expect(istNurPaarBezogenerBlocker('FJ-10', 'blocker')).toBe(true);
  });

  it('hält einen echten Förderjahr-Blocker NICHT für paarbezogen', () => {
    expect(istNurPaarBezogenerBlocker('FJ-05', 'blocker')).toBe(false);
  });

  it('stuft eine Warnung derselben Regel nicht als paarbezogenen Blocker ein', () => {
    expect(istNurPaarBezogenerBlocker('FJ-07c', 'warnung')).toBe(false);
  });

  it('ordnet den Schweregraden unterscheidbare Badge-Varianten zu', () => {
    expect(preflightSchwereBadgeVariante('blocker')).toBe('destructive');
    expect(preflightSchwereBadgeVariante('warnung')).toBe('warning');
    expect(preflightSchwereBadgeVariante('hinweis')).toBe('outline');
  });

  it('kennt die eigene Jahres-Qualitätsstufe (`nicht_nachweisbar`, nicht `nicht_ausweisbar`)', () => {
    expect(jahresQualitaetsStufeLabel('nicht_nachweisbar')).toBe('nicht nachweisbar');
  });

  it('übersetzt bekannte Energieträger und reicht unbekannte roh durch', () => {
    expect(energietraegerLabel('waerme')).toBe('Wärme');
    expect(energietraegerLabel('wasserstoff')).toBe('wasserstoff');
  });

  it('formatiert eine als String gelieferte Zeilenzahl mit Tausendertrennung', () => {
    expect(formatiereBigintAnzahl('12345')).toBe('12.345');
  });

  it('reicht eine nicht parsbare Zeilenzahl unverändert durch statt „NaN" zu zeigen', () => {
    expect(formatiereBigintAnzahl('unbekannt')).toBe('unbekannt');
  });
});

describe('formatiereFoerderjahrSpanne', () => {
  it('zeigt nur die Monate, wenn der Zeitraum sich mit ihnen deckt', () => {
    // Die kuerzere Darstellung liest sich besser, und es geht nichts verloren.
    expect(formatiereFoerderjahrSpanne('2027-01-01', '2027-04-01', '2027-01-01', '2027-05-01')).toBe(
      formatiereFoerderjahrZeitraum('2027-01-01', '2027-04-01'),
    );
  });

  it('zeigt die Tage, sobald der Bescheid welche nennt', () => {
    // Nur die Monate zu zeigen waere die falsche Auskunft: Der Nachweis
    // rechnet dann elf Tage anders, als die Oberflaeche behauptet.
    expect(formatiereFoerderjahrSpanne('2018-10-01', '2019-10-01', '2018-10-12', '2019-10-12')).toBe(
      '12.10.2018 – 11.10.2019',
    );
  });

  it('rechnet das exklusive Ende auf den letzten ENTHALTENEN Tag zurueck', () => {
    // Im Bescheid steht „bis 11.10.", nicht „bis 12.10.".
    expect(formatiereFoerderjahrSpanne('2022-10-01', '2023-10-01', '2022-10-12', '2023-10-12')).toContain(
      '11.10.2023',
    );
  });
});
