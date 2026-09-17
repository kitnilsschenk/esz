import { z } from 'zod';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EntityForm, type EntityFormFieldConfig } from './EntityForm';

const schema = z.object({
  name: z.string().min(1, 'Name ist erforderlich.'),
  aktiv: z.boolean(),
});

type Values = z.infer<typeof schema>;

const fields: readonly EntityFormFieldConfig[] = [
  { name: 'name', label: 'Name', kind: 'text' },
  { name: 'aktiv', label: 'Aktiv', kind: 'checkbox' },
];

describe('EntityForm', () => {
  it('zeigt einen Feldfehler und ruft onValidSubmit NICHT auf, wenn die Zod-Validierung fehlschlägt', () => {
    const onValidSubmit = vi.fn();
    render(
      <EntityForm<Values>
        schema={schema}
        fields={fields}
        defaultValues={{ name: '', aktiv: false }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={onValidSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Name ist erforderlich.');
    expect(onValidSubmit).not.toHaveBeenCalled();
  });

  it('ruft onValidSubmit mit den validierten Werten auf, wenn alle Pflichtfelder ausgefüllt sind', () => {
    const onValidSubmit = vi.fn();
    render(
      <EntityForm<Values>
        schema={schema}
        fields={fields}
        defaultValues={{ name: '', aktiv: false }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={onValidSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test GmbH' } });
    fireEvent.click(screen.getByLabelText('Aktiv'));
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(onValidSubmit).toHaveBeenCalledWith({ name: 'Test GmbH', aktiv: true });
  });

  it('deaktiviert den Submit-Button während isSubmitting', () => {
    render(
      <EntityForm<Values>
        schema={schema}
        fields={fields}
        defaultValues={{ name: '', aktiv: false }}
        submitLabel="Anlegen"
        isSubmitting={true}
        onValidSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Anlegen' })).toBeDisabled();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <EntityForm<Values>
        schema={schema}
        fields={fields}
        defaultValues={{ name: '', aktiv: false }}
        submitLabel="Anlegen"
        isSubmitting={false}
        submitErrorMessage="Serverfehler"
        onValidSubmit={vi.fn()}
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('unterstützt select- (Referenz-Auswahl/Enum) und date-Felder (ADR-0008 §23 / D11 Pass 1)', () => {
    const erweitertesSchema = z.object({
      systemId: z.string().min(1, 'Pflichtfeld.'),
      gueltigVon: z.string().min(1, 'Pflichtfeld.'),
    });
    type ErweiterteValues = z.infer<typeof erweitertesSchema>;
    const erweiterteFields: readonly EntityFormFieldConfig[] = [
      {
        name: 'systemId',
        label: 'System',
        kind: 'select',
        placeholder: 'Bitte wählen',
        options: [{ value: 'sys-1', label: 'System 1' }],
      },
      { name: 'gueltigVon', label: 'Gültig von', kind: 'date' },
    ];
    const onValidSubmit = vi.fn();

    render(
      <EntityForm<ErweiterteValues>
        schema={erweitertesSchema}
        fields={erweiterteFields}
        defaultValues={{ systemId: '', gueltigVon: '' }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={onValidSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('System'), { target: { value: 'sys-1' } });
    fireEvent.change(screen.getByLabelText('Gültig von'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(onValidSubmit).toHaveBeenCalledWith({ systemId: 'sys-1', gueltigVon: '2026-01-01' });
  });

  it('markiert Pflichtfelder sichtbar (aria-hidden `*`) und für Screenreader (aria-required, aria-describedby)', () => {
    render(
      <EntityForm<Values>
        schema={schema}
        fields={fields}
        defaultValues={{ name: '', aktiv: false }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={vi.fn()}
      />,
    );

    const nameFeld = screen.getByLabelText('Name');
    expect(nameFeld).toHaveAttribute('aria-required', 'true');
    expect(nameFeld.getAttribute('aria-describedby')).toMatch(/required-hint/);
    // Der Accessible Name bleibt exakt "Name" (Sternchen sitzt AUSSERHALB des
    // <label>, damit bestehende `getByLabelText('Name')`-Abfragen nicht brechen).
    expect(screen.getByText('*', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();

    // Checkboxen bekommen NIE einen Pflichtfeld-Hinweis.
    expect(screen.getByLabelText('Aktiv')).not.toHaveAttribute('aria-required');
  });

  it('unterdrückt die Pflichtfeld-Markierung, wenn `required: false` gesetzt ist', () => {
    const optionalesFeldSchema = z.object({ kommentar: z.string() });
    type OptionaleValues = z.infer<typeof optionalesFeldSchema>;
    const optionaleFields: readonly EntityFormFieldConfig[] = [
      { name: 'kommentar', label: 'Kommentar', kind: 'text', required: false },
    ];

    render(
      <EntityForm<OptionaleValues>
        schema={optionalesFeldSchema}
        fields={optionaleFields}
        defaultValues={{ kommentar: '' }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Kommentar')).not.toHaveAttribute('aria-required');
    expect(screen.queryByText('*', { selector: '[aria-hidden="true"]' })).not.toBeInTheDocument();
  });

  it('setzt den Fokus auf das erste fehlerhafte Feld nach einem fehlgeschlagenen Submit', () => {
    const mehrfeldSchema = z.object({
      erstesFeld: z.string().min(1, 'Erstes Feld ist erforderlich.'),
      zweitesFeld: z.string().min(1, 'Zweites Feld ist erforderlich.'),
    });
    type MehrfeldValues = z.infer<typeof mehrfeldSchema>;
    const mehrfeldFields: readonly EntityFormFieldConfig[] = [
      { name: 'erstesFeld', label: 'Erstes Feld', kind: 'text' },
      { name: 'zweitesFeld', label: 'Zweites Feld', kind: 'text' },
    ];

    render(
      <EntityForm<MehrfeldValues>
        schema={mehrfeldSchema}
        fields={mehrfeldFields}
        defaultValues={{ erstesFeld: '', zweitesFeld: '' }}
        submitLabel="Anlegen"
        isSubmitting={false}
        onValidSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(document.activeElement).toBe(screen.getByLabelText('Erstes Feld'));
  });
});
