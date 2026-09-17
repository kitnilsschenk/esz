import { useId, type ReactNode } from 'react';
import { Card, CardContent } from '../../../shared/ui/card';
import { Label } from '../../../shared/ui/label';
import { Select } from '../../../shared/ui/select';
import {
  einsparlaufArtLabel,
  useFoerderjahreListeView,
  type EinsparlaufFilterView,
} from '../hooks';
import { EINSPARLAUF_ART_WERTE } from '../api';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufFilterLeisteProps {
  readonly filterView: EinsparlaufFilterView;
}

/**
 * Filterleiste der Einspar-Lauf-Liste. Die Förderjahr-Auswahl kommt aus der
 * bestehenden Förderjahr-Liste — kein zweiter Abfrage-Pfad.
 *
 * Der dritte Filter heißt „Nur Erstläufe" und nicht „Nur aktuelle Läufe": Er
 * blendet Korrekturläufe aus, nicht abgelöste. Was der Server tatsächlich
 * filtert, steht in `useEinsparlaufFilterView`.
 */
export function EinsparlaufFilterLeiste({ filterView }: EinsparlaufFilterLeisteProps): ReactNode {
  const foerderjahre = useFoerderjahreListeView();
  const foerderjahrId = useId();
  const artId = useId();
  const erstlaeufeId = useId();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-6 pt-6">
        <div className="space-y-2">
          <Label htmlFor={foerderjahrId}>{t('nachweis.einsparlauf.listPage.filterFoerderjahr')}</Label>
          <Select
            id={foerderjahrId}
            value={filterView.foerderjahrId}
            onChange={(event) => {
              filterView.setzeFoerderjahrId(event.target.value);
            }}
          >
            <option value="">{t('nachweis.einsparlauf.listPage.filterAlle')}</option>
            {foerderjahre.items.map((eintrag) => (
              <option key={eintrag.id} value={eintrag.id}>
                {eintrag.code}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={artId}>{t('nachweis.einsparlauf.listPage.filterArt')}</Label>
          <Select
            id={artId}
            value={filterView.art}
            onChange={(event) => {
              filterView.setzeArt(event.target.value);
            }}
          >
            <option value="">{t('nachweis.einsparlauf.listPage.filterAlle')}</option>
            {EINSPARLAUF_ART_WERTE.map((wert) => (
              <option key={wert} value={wert}>
                {einsparlaufArtLabel(wert)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <input
            id={erstlaeufeId}
            type="checkbox"
            className="h-4 w-4 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            checked={filterView.nurErstlaeufe}
            onChange={(event) => {
              filterView.setzeNurErstlaeufe(event.target.checked);
            }}
          />
          <Label htmlFor={erstlaeufeId} className="font-normal">
            {t('nachweis.einsparlauf.listPage.filterNurErstlaeufe')}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
