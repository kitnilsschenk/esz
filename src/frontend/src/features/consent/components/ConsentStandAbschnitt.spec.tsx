import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { ConsentStandAbschnitt } from './ConsentStandAbschnitt';

const { standViewMock } = vi.hoisted(() => ({ standViewMock: vi.fn() }));

vi.mock('../hooks/useConsentStandView', () => ({ useConsentStandView: standViewMock }));

const MESSUNG = {
  zweckCode: 'messdaten_verarbeitung',
  bezeichnung: 'Verbrauchsmessung',
  verweigerbar: false,
  // Fuer den Endkunden ist die Verbrauchsmessung Vertragserfuellung (V0047).
  // Genau diese Kombination — nicht verweigerbar UND lit. b — war die Stelle,
  // an der die Oberflaeche von einer "Einwilligung" sprach, die man nicht
  // verweigern kann. Die gibt es nach Art. 7 Abs. 4 nicht.
  beruhtAufEinwilligung: false,
  rechtsgrundlageLabel: 'Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)',
  begruendung: 'Ohne Messung ist der Vertrag nicht zu erfüllen.',
  erlaubnismodus: 'opt_in' as const,
  erteilbar: true,
  istWirksam: true,
  statusLabel: 'Einwilligung liegt vor',
  wirksameId: '018f1e2d-0000-7000-8000-0000000000c1',
  detailLabel: 'Erteilt am 05.09.2026, 14:00 auf Grundlage der Fassung 1.0.',
  verlauf: [
    {
      id: '018f1e2d-0000-7000-8000-0000000000c1',
      fassung: '1.0',
      erteiltLabel: '05.09.2026, 14:00',
      widerrufenLabel: undefined,
      rechtsgrundlageLabel: 'Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)',
      erfassungswegLabel: 'Schriftlich erteilt',
      quelleRefLabel: 'AZ-2026-0815',
    },
  ],
  widersprechbar: false,
  widerspruchWirksam: false,
  wirksamerWiderspruchId: undefined,
  widerspruchDetailLabel: undefined,
  widerspruchVerlauf: [],
};

const NUTZERINFO = {
  zweckCode: 'nutzerinformation',
  bezeichnung: 'Monatliche Nutzerinformation',
  verweigerbar: true,
  beruhtAufEinwilligung: true,
  rechtsgrundlageLabel: 'Einwilligung (Art. 6 Abs. 1 lit. a DSGVO)',
  begruendung: 'Kein Vertrag, also lit. a.',
  erlaubnismodus: 'opt_in' as const,
  erteilbar: true,
  istWirksam: false,
  statusLabel: 'Keine Einwilligung',
  wirksameId: undefined,
  detailLabel: undefined,
  verlauf: [],
  widersprechbar: false,
  widerspruchWirksam: false,
  wirksamerWiderspruchId: undefined,
  widerspruchDetailLabel: undefined,
  widerspruchVerlauf: [],
};

/**
 * Die monatliche Nutzerinformation beim ENDKUNDEN: `opt_out` — sie laeuft,
 * bis widersprochen wird (TB-06). Genau hier klaffte die Luecke: Ein Kunde,
 * der die Zusendung abbestellt, war im Betrieb nicht erfassbar, obwohl der
 * Erzeugungslauf einen Widerspruch laengst auswertet
 * (`nutzerinfo.repository.ts`, `hatWiderspruch`).
 */
const NUTZERINFO_OPT_OUT = {
  ...NUTZERINFO,
  rechtsgrundlageLabel: 'Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)',
  beruhtAufEinwilligung: false,
  verweigerbar: false,
  erlaubnismodus: 'opt_out' as const,
  erteilbar: false,
  istWirksam: false,
  statusLabel: 'Gilt über den Vertrag',
  widersprechbar: true,
};

const erteile = vi.fn();
const widerrufe = vi.fn();
const widersprich = vi.fn();
const nimmWiderspruchZurueck = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  standViewMock.mockReturnValue({
    zwecke: [MESSUNG, NUTZERINFO],
    isPending: false,
    isError: false,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    erteile,
    widerrufe,
    widersprich,
    nimmWiderspruchZurueck,
    laufenderZweck: undefined,
    ...overrides,
  });
}

function renderAbschnitt(): ReturnType<typeof render> {
  return render(<ConsentStandAbschnitt subjektTyp="endkunde" subjektId="018f1e2d-0000-7000-8000-00000000000e" headingId="h" />);
}

describe('ConsentStandAbschnitt (ADR-0012 B2)', () => {
  beforeEach(() => {
    mockView();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('zeigt AUCH Zwecke ohne Einwilligung — sonst bliebe das Nicht-Erteilte unsichtbar', () => {
    // Art. 15 DSGVO: „Hierzu wurde nie eingewilligt" ist eine Aussage, die
    // getroffen werden muss, keine Leerstelle zum Erraten.
    renderAbschnitt();

    expect(screen.getByText('Monatliche Nutzerinformation')).toBeInTheDocument();
    expect(screen.getByText('Keine Einwilligung')).toBeInTheDocument();
  });

  it('nennt einen vertraglich erforderlichen Zweck nicht "Einwilligung" (Art. 7 Abs. 4)', () => {
    // Der Widerspruch, den dieser Test festhaelt: Am selben Zweck stand
    // "Ohne diese Einwilligung ist die Leistung nicht zu erbringen" UND
    // "Zu diesem Zweck ist keine Einwilligung zu erfassen". Eine nicht
    // verweigerbare Einwilligung ist keine — erforderlich ist der ZWECK,
    // seine Grundlage ist der Vertrag.
    renderAbschnitt();

    expect(screen.getByText(/Für die Leistung erforderlich/)).toBeInTheDocument();
    expect(screen.queryByText(/Ohne diese Einwilligung/)).not.toBeInTheDocument();
    expect(screen.getByText(/Freiwillig\. Ablehnung und Widerruf sind jederzeit möglich/)).toBeInTheDocument();
  });

  it('bietet an einem vertraglichen Zweck den WIDERSPRUCH an, nicht die Einwilligung', () => {
    // Bis zuletzt stand hier nur „Zu diesem Zweck ist keine Einwilligung zu
    // erfassen" — richtig, aber unvollstaendig: Erteilt wird nichts,
    // widersprochen aber sehr wohl (AW-27, V0052). Genau das war die Luecke.
    mockView({
      zwecke: [
        { ...MESSUNG, erteilbar: false, istWirksam: false, erlaubnismodus: 'vertraglich', widersprechbar: true },
      ],
    });
    renderAbschnitt();

    expect(screen.queryByRole('button', { name: 'Einwilligung erfassen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Widerspruch erfassen' })).toBeInTheDocument();
  });

  it('hält die ausführliche Begründung eingeklappt bereit statt sie in den Bedienablauf zu stellen', () => {
    // Die Begründungen der Matrix tragen Auflagenkürzel und
    // Aktenvermerk-Verweise. Sie dürfen nicht verschwinden — wer die
    // Grundlage hinterfragen will, muss sie nachlesen können — aber sie
    // gehören nicht in die erste Zeile der Bedienung.
    renderAbschnitt();

    expect(screen.getAllByText('Ausführliche Begründung').length).toBeGreaterThan(0);
  });

  it('BIETET die Rechtsgrundlage nicht zur Auswahl an (A12-1)', () => {
    // Sie wird serverseitig aus der Matrix bestimmt. Ein Auswahlfeld haette
    // die Entscheidung an die falsche Stelle gelegt.
    renderAbschnitt();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('ZEIGT die geltende Rechtsgrundlage samt Begruendung', () => {
    // Eine Grundlage, die der Bediener nicht sieht, kann er nicht
    // hinterfragen.
    renderAbschnitt();

    expect(screen.getByText(/Kein Vertrag, also lit\. a\./)).toBeInTheDocument();
  });

  it('sperrt das Erfassen, solange Erklaerungsdatum oder Fundstelle fehlen (A12-27/28)', () => {
    // Ohne beides waere der Nachweis unrichtig bzw. das Dokument nicht
    // auffindbar — der Grund fuer das Teil-Veto des compliance-director.
    renderAbschnitt();

    expect(screen.getByRole('button', { name: 'Einwilligung erfassen' })).toBeDisabled();
  });

  it('warnt an einem VERTRAGLICHEN Zweck anders als an einer Abwahl', () => {
    // Die Datenbank laesst beide zu (`ck_widerspruch_kein_opt_in` schliesst
    // nur opt_in aus). Fachlich ist es aber ein Unterschied, ob jemand eine
    // Zusatzleistung abwaehlt oder der Leistung selbst widerspricht.
    mockView({
      zwecke: [
        { ...MESSUNG, erteilbar: false, istWirksam: false, erlaubnismodus: 'vertraglich', widersprechbar: true },
      ],
    });
    renderAbschnitt();

    expect(screen.getByText(/betrifft die Leistung selbst/)).toBeInTheDocument();
    expect(screen.queryByText(/laeuft, bis ihr widersprochen wird/)).not.toBeInTheDocument();
  });

  it('belegt das Erklaerungsdatum NICHT mit dem heutigen Tag vor', () => {
    // Ein vorausgefuelltes Heute waere die bequemste Falschangabe von allen.
    renderAbschnitt();

    expect(screen.getAllByLabelText('Erklärt am')[0]).toHaveValue('');
  });

  it('erfasst mit Erklaerungsdatum und Fundstelle — ohne Grundlagen-Eingabe', () => {
    renderAbschnitt();

    const daten = screen.getAllByLabelText('Erklärt am');
    fireEvent.change(daten[1] as HTMLElement, { target: { value: '2026-03-14' } });
    const quellen = screen.getAllByLabelText('Fundstelle');
    fireEvent.change(quellen[1] as HTMLElement, { target: { value: 'AZ-2026-0815' } });

    fireEvent.click(screen.getByRole('button', { name: 'Einwilligung erfassen' }));

    expect(erteile).toHaveBeenCalledWith('nutzerinformation', {
      erklaertAm: '2026-03-14',
      quelleRef: 'AZ-2026-0815',
    });
  });

  it('bietet fuer eine wirksame Einwilligung den Widerruf an — mit denselben Belegangaben', () => {
    renderAbschnitt();

    const daten = screen.getAllByLabelText('Erklärt am');
    fireEvent.change(daten[0] as HTMLElement, { target: { value: '2026-08-01' } });
    const quellen = screen.getAllByLabelText('Fundstelle');
    fireEvent.change(quellen[0] as HTMLElement, { target: { value: 'AZ-2026-0999' } });

    fireEvent.click(screen.getByRole('button', { name: 'Widerrufen' }));

    expect(widerrufe).toHaveBeenCalledWith(MESSUNG.wirksameId, {
      erklaertAm: '2026-08-01',
      quelleRef: 'AZ-2026-0999',
    });
  });

  it('sperrt auch den Widerruf ohne Belegangaben', () => {
    renderAbschnitt();

    expect(screen.getByRole('button', { name: 'Widerrufen' })).toBeDisabled();
  });

  it('fuehrt den Verlauf, nicht nur den aktuellen Stand', () => {
    renderAbschnitt();

    fireEvent.click(screen.getByText(/Verlauf anzeigen \(1\)/));

    expect(screen.getByText(/Schriftlich erteilt/)).toBeInTheDocument();
  });

  it('bietet den digitalen Weg gar nicht erst an', () => {
    // ADR-0012 E9: Die einzige hier verfuegbare IP waere die des
    // Bearbeiters. Ein Auswahlfeld dafuer waere eine Einladung zur
    // Faelschung des Nachweises.
    renderAbschnitt();

    expect(screen.queryByText(/Digitale Zustimmung/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Erfassungsweg/)).not.toBeInTheDocument();
  });

  it('benennt nach dem Widerruf, dass Vergangenes rechtmaessig bleibt', () => {
    mockView({
      erfolgsMeldung:
        'Widerruf vermerkt. Die Einwilligung endet ab diesem Zeitpunkt — was bis dahin verarbeitet wurde, bleibt rechtmäßig und wird nicht gelöscht.',
    });
    renderAbschnitt();

    expect(screen.getByText(/bleibt rechtmäßig und wird nicht gelöscht/)).toBeInTheDocument();
  });

  it('zeigt einen Fehler als Alarm-Region', () => {
    mockView({ submitErrorMessage: 'Zu diesem Zweck besteht bereits eine wirksame Einwilligung.' });
    renderAbschnitt();

    const alarm = screen.getByRole('alert');
    expect(within(alarm).getByText(/bereits eine wirksame Einwilligung/)).toBeInTheDocument();
  });

  it('erfasst den Widerspruch mit Erklaerungsdatum und Fundstelle', () => {
    // TB-06: Die monatliche Nutzerinformation laeuft, bis widersprochen
    // wird. Der Erzeugungslauf wertet den Widerspruch laengst aus — nur
    // erfassen konnte ihn niemand.
    mockView({ zwecke: [NUTZERINFO_OPT_OUT] });
    renderAbschnitt();

    fireEvent.change(screen.getByLabelText('Erklärt am'), { target: { value: '2026-04-02' } });
    fireEvent.change(screen.getByLabelText('Fundstelle'), { target: { value: 'AZ-2026-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Widerspruch erfassen' }));

    expect(widersprich).toHaveBeenCalledWith('nutzerinformation', {
      erklaertAm: '2026-04-02',
      quelleRef: 'AZ-2026-1234',
    });
  });

  it('sperrt den Widerspruch ohne Belegangaben — wie jede andere Erklaerung', () => {
    mockView({ zwecke: [NUTZERINFO_OPT_OUT] });
    renderAbschnitt();

    expect(screen.getByRole('button', { name: 'Widerspruch erfassen' })).toBeDisabled();
  });

  it('zeigt einen wirksamen Widerspruch im STATUS, nicht nur im Verlauf', () => {
    // Stuende hier weiter „Gilt ueber den Vertrag", behauptete die Ansicht
    // eine laufende Verarbeitung, der widersprochen wurde.
    mockView({
      zwecke: [
        {
          ...NUTZERINFO_OPT_OUT,
          statusLabel: 'Widersprochen',
          widerspruchWirksam: true,
          wirksamerWiderspruchId: '018f1e2d-0000-7000-8000-0000000000d1',
          widerspruchDetailLabel: 'Widersprochen seit 02.04.2026, 02:00',
        },
      ],
    });
    renderAbschnitt();

    expect(screen.getByText('Widersprochen')).toBeInTheDocument();
    expect(screen.getByText(/Widersprochen seit 02\.04\.2026/)).toBeInTheDocument();
  });

  it('bietet bei wirksamem Widerspruch die RUECKNAHME an, nicht ein zweites Widersprechen', () => {
    // Ein zweiter Widerspruch waere ein zweiter Erklaerungszeitpunkt zur
    // selben Sache; der Server antwortet darauf mit 409.
    const widerspruchId = '018f1e2d-0000-7000-8000-0000000000d1';
    mockView({
      zwecke: [
        {
          ...NUTZERINFO_OPT_OUT,
          widerspruchWirksam: true,
          wirksamerWiderspruchId: widerspruchId,
        },
      ],
    });
    renderAbschnitt();

    expect(screen.queryByRole('button', { name: 'Widerspruch erfassen' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Erklärt am'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Fundstelle'), { target: { value: 'AZ-2026-2222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Widerspruch zurücknehmen' }));

    expect(nimmWiderspruchZurueck).toHaveBeenCalledWith(widerspruchId, {
      erklaertAm: '2026-06-01',
      quelleRef: 'AZ-2026-2222',
    });
  });

  it('haelt Widerspruchs- und Einwilligungs-Verlauf AUSEINANDER', () => {
    // Zwei verschiedene Rechte, die man ohnehin leicht verwechselt. In einer
    // Liste muesste eine Auskunft nach Art. 15 sie wieder aufteilen.
    mockView({
      zwecke: [
        {
          ...NUTZERINFO_OPT_OUT,
          widerspruchVerlauf: [
            {
              id: '018f1e2d-0000-7000-8000-0000000000d1',
              erklaertLabel: '02.04.2026, 02:00',
              zurueckgenommenLabel: '01.06.2026, 02:00',
              erfassungswegLabel: 'Schriftlich erteilt',
              quelleRefLabel: 'AZ-2026-1234',
            },
          ],
        },
      ],
    });
    renderAbschnitt();

    fireEvent.click(screen.getByText(/Widersprüche anzeigen \(1\)/));

    expect(screen.getByText(/zurückgenommen am 01\.06\.2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Verlauf anzeigen/)).not.toBeInTheDocument();
  });

  it('bietet den Widerspruch NICHT an, wo alles auf Einwilligung beruht', () => {
    // Beim Anschlussnutzer ist heute jeder Zweck `opt_in` (V0047-Matrix).
    // Dort widerspricht man nicht — man widerruft. Ein Knopf, den der Server
    // mit 400 beantwortet, waere eine Einladung zum Falschen.
    renderAbschnitt();

    expect(screen.queryByRole('button', { name: 'Widerspruch erfassen' })).not.toBeInTheDocument();
  });

  it('ist auch mit Widerspruchs-Zweig barrierefrei (axe)', async () => {
    mockView({ zwecke: [NUTZERINFO_OPT_OUT] });
    const { container } = renderAbschnitt();

    expect(await runAxe(container)).toEqual([]);
  });

  it('ist barrierefrei (axe)', async () => {
    const { container } = renderAbschnitt();

    expect(await runAxe(container)).toEqual([]);
  });
});
