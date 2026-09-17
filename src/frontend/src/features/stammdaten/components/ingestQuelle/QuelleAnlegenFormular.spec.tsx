import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { QuelleAnlegenFormular } from './QuelleAnlegenFormular';

const { useQuelleAnlegenViewMock } = vi.hoisted(() => ({ useQuelleAnlegenViewMock: vi.fn() }));

vi.mock('../../hooks/ingestQuelle', () => ({ useQuelleAnlegenView: useQuelleAnlegenViewMock }));

const anlegen = vi.fn();

const ZERTIFIKAT = '-----BEGIN CERTIFICATE-----\nTESTINHALT\n-----END CERTIFICATE-----';
const SCHLUESSEL = '-----BEGIN PRIVATE KEY-----\nTESTINHALT\n-----END PRIVATE KEY-----';

function mockView(overrides: Record<string, unknown> = {}): void {
  useQuelleAnlegenViewMock.mockReturnValue({
    tlsOptionen: [
      { value: 'kein_tls', label: 'Unverschlüsselt' },
      { value: 'tls', label: 'TLS' },
      { value: 'mtls', label: 'TLS mit Client-Zertifikat' },
    ],
    anlegen,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    ...overrides,
  });
}

function rendere(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <h1>Datenaufnahme</h1>
      <QuelleAnlegenFormular />
    </MemoryRouter>,
  );
  // Das Formular beginnt zugeklappt: Dreizehn Felder duerfen die
  // Betriebsseite nicht beherrschen. Die Tests oeffnen es wie ein Bediener.
  fireEvent.click(screen.getByRole('button', { name: 'Neue Datenquelle' }));
  return container;
}

/** Füllt die Pflichtfelder; `tls` als Vorgabe, kein Zertifikat nötig. */
function fuellePflichtfelder(): void {
  fireEvent.change(screen.getByLabelText(/^Kennung/), { target: { value: 'netz-lahnstein' } });
  fireEvent.change(screen.getByLabelText(/Bezeichnung/), { target: { value: 'ChirpStack Lahnstein' } });
  fireEvent.change(screen.getByLabelText(/Broker-Adresse/), { target: { value: 'mqtt.example.org:8883' } });
}

afterEach(() => {
  vi.clearAllMocks();
  useQuelleAnlegenViewMock.mockReset();
});

describe('QuelleAnlegenFormular', () => {
  it('maskiert das Passwort-Feld', () => {
    // Der Wert erscheint danach nirgends mehr — beim EINTIPPEN kann aber
    // jemand danebenstehen.
    mockView();
    rendere();

    expect(screen.getByLabelText(/Passwort/)).toHaveAttribute('type', 'password');
  });

  it('legt eine Quelle mit den Pflichtfeldern an', () => {
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(anlegen).toHaveBeenCalledTimes(1);
    expect(anlegen.mock.calls[0]?.[0]).toMatchObject({
      quelleCode: 'netz-lahnstein',
      brokerHost: 'mqtt.example.org:8883',
      tlsModus: 'tls',
    });
  });

  it('weist Zugangsdaten in der Broker-Adresse zurueck und sagt, wohin sie gehoeren', () => {
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.change(screen.getByLabelText(/Broker-Adresse/), { target: { value: 'worker:geheim@mqtt.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(screen.getByText(/Zugangsdaten gehören in die Felder Benutzername und Passwort/)).toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('verlangt bei Client-Zertifikat auch den privaten Schluessel', () => {
    // Ohne beides scheitert erst der Verbindungsaufbau — unbemerkt, im
    // Worker-Protokoll. Der Hinweis gehoert an das Feld, nicht in eine
    // Fehlermeldung nach dem Absenden.
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.change(screen.getByLabelText(/^Verbindung/), { target: { value: 'mtls' } });
    fireEvent.change(screen.getByLabelText(/Client-Zertifikat/), { target: { value: ZERTIFIKAT } });
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(screen.getByText(/wird auch der private Schlüssel benötigt/)).toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('nimmt ein vollstaendiges Client-Zertifikat entgegen', () => {
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.change(screen.getByLabelText(/^Verbindung/), { target: { value: 'mtls' } });
    fireEvent.change(screen.getByLabelText(/Client-Zertifikat/), { target: { value: ZERTIFIKAT } });
    fireEvent.change(screen.getByLabelText(/Privater Schlüssel/), { target: { value: SCHLUESSEL } });
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(anlegen).toHaveBeenCalledTimes(1);
    expect(anlegen.mock.calls[0]?.[0]).toMatchObject({ tlsModus: 'mtls', clientSchluessel: SCHLUESSEL });
  });

  it('weist einen Text zurueck, der kein PEM-Block ist', () => {
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.change(screen.getByLabelText(/CA-Zertifikat/), { target: { value: 'irgendein Text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    // Der Feldhinweis nennt „PEM-Block" ebenfalls — gesucht ist die
    // Fehlermeldung, also die Rolle `alert`.
    expect(screen.getByRole('alert')).toHaveTextContent(/-----BEGIN/);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('verlangt zu einem Passwort auch einen Benutzernamen', () => {
    mockView();
    rendere();

    fuellePflichtfelder();
    fireEvent.change(screen.getByLabelText(/Passwort/), { target: { value: 'geheim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Datenquelle anlegen' }));

    expect(screen.getByText(/ohne Benutzername kann der Broker nicht prüfen/)).toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
