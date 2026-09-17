import { describe, expect, it } from 'vitest';
import { brotkrume } from './brotkrumenPfade';

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('brotkrume (Pfad-Bausteine)', () => {
  it('nutzt für die Vorfahren dieselben Wörter wie die Navigation', () => {
    // Wer über den Nav-Eintrag „Zähler & Messkanäle" einsteigt, soll dieses
    // Wort im Pfad wiederfinden — kein Synonym.
    expect(brotkrume.zaehlerListe()).toEqual({ label: 'Zähler & Messkanäle', to: '/stammdaten/zaehler' });
    expect(brotkrume.systemeListe()).toEqual({ label: 'Systemgrenzen', to: '/stammdaten/systeme' });
    expect(brotkrume.nutzungsverhaeltnisseListe()).toEqual({
      label: 'Verträge & Nutzung',
      to: '/stammdaten/nutzungsverhaeltnisse',
    });
  });

  it('zeigt für personenbezogene Entitäten die Kurz-ID, NIEMALS einen Klartextnamen', () => {
    // Der Brotkrumenpfad ist dauerhaft sichtbarer Seitenrahmen und stünde
    // sonst auf jeder Unterseite mit (Art. 5 DSGVO, Datenminimierung) —
    // dieselbe Linie wie `PiiMaskedField`. Die Bausteine nehmen deshalb nur
    // eine ID entgegen; ein Name kann hier gar nicht erst hineingereicht
    // werden.
    expect(brotkrume.endkunde(ENDKUNDE_ID)).toEqual({
      label: '0198c3aa',
      to: `/stammdaten/endkunden/${ENDKUNDE_ID}`,
    });
  });

  it('lässt das letzte Glied bewusst ohne Ziel', () => {
    expect(brotkrume.aktuell('Bearbeiten')).toEqual({ label: 'Bearbeiten' });
  });
});
