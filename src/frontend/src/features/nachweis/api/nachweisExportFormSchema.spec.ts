import { describe, expect, it } from 'vitest';
import {
  NACHWEIS_EXPORT_ZWECK_WERTE,
  nachweisExportErzeugenFormDefaultValues,
  toNachweisExportErzeugenPayload,
} from './nachweisExportFormSchema';

describe('nachweisExportErzeugenFormSchema', () => {
  it('bietet den Zweck „wissenschaftliche Auswertung" NICHT an', () => {
    // Der Wert ist serverseitig fail-closed gesperrt, solange Empfänger,
    // Rolle und Rechtsgrundlage ungeklärt sind. Eine Auswahl, die sicher in
    // eine Ablehnung läuft, wäre eine Attrappe.
    expect(NACHWEIS_EXPORT_ZWECK_WERTE).toEqual(['nachweis', 'erfolgskontrolle']);
  });

  it('sendet die Klimastation IMMER pseudonymisiert', () => {
    // Der Klarname verlangt eine Zweitfreigabe, die es nicht gibt. Der Wert
    // wird ausdrücklich gesetzt statt weggelassen — sonst hinge eine
    // datenschutzrechtliche Entscheidung an einem Server-Default.
    for (const zweck of NACHWEIS_EXPORT_ZWECK_WERTE) {
      expect(toNachweisExportErzeugenPayload({ zweck })).toEqual({ zweck, stationDarstellung: 'pseudonymisiert' });
    }
  });

  it('ist mit „Nachweis" vorbelegt', () => {
    expect(nachweisExportErzeugenFormDefaultValues.zweck).toBe('nachweis');
  });
});
