import { useId, useState, type ReactNode } from 'react';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { Badge } from '../../../../shared/ui/badge';
import { Button } from '../../../../shared/ui/button';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useArt19PflichtenView, type Art19PflichtZeile } from '../../hooks/art19';
import {
  UNTERRICHTUNG_KANAL_OPTIONEN,
  type UnterrichtungKanal,
} from '../../hooks/shared/unterrichtungKanal';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

/**
 * Mitteilungspflichten nach Art. 19 DSGVO (ADR-0007 A18/A11.12).
 *
 * Zeigt offene UND erfüllte Pflichten. Die erfüllten sind der Beleg — sie
 * auszublenden würde die Liste zur Aufgabenliste verkürzen und genau die
 * Nachweisfunktion verlieren, für die sie gebaut ist.
 *
 * Der Kanal wird EINMAL oben gewählt und gilt für alle Meldungen dieser
 * Sitzung: in der Praxis unterrichtet man denselben Empfänger auf demselben
 * Weg. Ein Auswahlfeld je Zeile wäre Bedienaufwand ohne Erkenntnisgewinn —
 * und der Kanal ist, anders als der Sperrgrund, keine fachliche Feststellung
 * über die betroffene Person, sondern eine Angabe über den eigenen Vorgang.
 *
 * PII-frei: Pseudonym-Surrogate, geschlossene Codes, Zeitangaben. Der
 * differenzierte Art.-18-Grund erscheint hier NICHT — er verlässt das System
 * nicht (ADR-0007 C4 Punkt 6), und diese Liste beschreibt die Sicht des
 * Empfängers.
 */
export function Art19PflichtenTabelle(): ReactNode {
  const view = useArt19PflichtenView();
  const [kanal, setKanal] = useState<UnterrichtungKanal | ''>('');
  const kanalFeldId = useId();

  const columns: readonly DataListColumn<Art19PflichtZeile>[] = [
    {
      key: 'einreichung',
      header: t('stammdaten.monitoring.art19.tabelle.einreichung'),
      render: (zeile) => `${zeile.item.empfaenger} · ${kurzId(zeile.item.einreichungId)}`,
    },
    {
      key: 'uebermitteltAt',
      header: t('stammdaten.monitoring.art19.tabelle.uebermitteltAt'),
      render: (zeile) => formatiereZeitpunkt(zeile.item.uebermitteltAt),
    },
    {
      key: 'subjekt',
      header: t('stammdaten.monitoring.art19.tabelle.subjekt'),
      render: (zeile) => `${zeile.subjektLabel} ${kurzId(zeile.item.subjektId)}`,
    },
    {
      key: 'anlass',
      header: t('stammdaten.monitoring.art19.tabelle.anlass'),
      render: (zeile) => zeile.anlassLabel,
    },
    {
      key: 'status',
      header: t('stammdaten.monitoring.art19.tabelle.status'),
      render: (zeile) =>
        zeile.item.offen ? (
          <Button
            type="button"
            onClick={() => {
              if (kanal !== '') {
                view.melden.mitteilen(zeile.item, kanal);
              }
            }}
            disabled={view.melden.isSubmitting || kanal === ''}
          >
            {t('stammdaten.monitoring.art19.tabelle.meldenAction')}
          </Button>
        ) : (
          <Badge variant="success">
            {t('stammdaten.monitoring.art19.tabelle.mitgeteiltAm')}{' '}
            {zeile.item.mitgeteiltAm === null ? '' : formatiereZeitpunkt(zeile.item.mitgeteiltAm)}
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <StatusRegion ton="fehler" nachricht={view.melden.submitErrorMessage} />
      <StatusRegion ton="erfolg" nachricht={view.melden.erfolgsMeldung} />
      <div className="max-w-sm space-y-2">
        <Label htmlFor={kanalFeldId}>{t('stammdaten.monitoring.art19.kanalLabel')}</Label>
        <Select
          id={kanalFeldId}
          value={kanal}
          onChange={(event) => setKanal(event.target.value as UnterrichtungKanal | '')}
        >
          <option value="">{t('stammdaten.common.einschraenkungAufhebung.kanalPlatzhalter')}</option>
          {UNTERRICHTUNG_KANAL_OPTIONEN.map((option) => (
            <option key={option.wert} value={option.wert}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>
      </div>
      <DataList<Art19PflichtZeile>
        caption={t('stammdaten.monitoring.art19.tabelle.caption')}
        columns={columns}
        items={view.zeilen}
        getRowKey={(zeile) => `${zeile.item.einreichungId}:${zeile.item.subjektId}:${zeile.item.anlass}`}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.monitoring.art19.tabelle.leer')}
      />
    </div>
  );
}
