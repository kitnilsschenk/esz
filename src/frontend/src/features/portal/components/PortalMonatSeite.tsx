import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BerichtAnsicht } from '../../nutzerinfo';
import { baueBerichtView } from '../../nutzerinfo/hooks/useNutzerinfoBerichtView';
import { StatusRegion } from '../../../shared/ui/status-region';
import { t } from '../../../shared/i18n/t';
import { usePortalBericht } from '../api';
import { monatLabel } from '../hooks/usePortalVerlaufView';
import { usePortalTitel } from '../hooks/usePortalTitel';
import { PortalDruckAktion } from './PortalDruckAktion';

/**
 * Ein Monat im Detail — GENAU die Darstellung, die der Betrieb als Vorschau
 * sieht (`BerichtAnsicht`), nur über den Kundenweg geladen.
 *
 * Die Ansicht wird geteilt und nicht nachgebaut. Zwei Formulierungen derselben
 * Zahl wären die Stelle, an der die Auskunft an die betroffene Person von der
 * Betriebssicht abweicht — und ausgerechnet dort darf sie es nicht.
 */
export function PortalMonatSeite(): ReactNode {
  const { informationId } = useParams<{ informationId: string }>();
  const query = usePortalBericht(informationId ?? '');
  const view = baueBerichtView(query.data, { isPending: query.isPending, isError: query.isError });
  const monat = query.data?.information.monat;
  usePortalTitel(monat === undefined ? undefined : monatLabel(monat));

  if (informationId === undefined) {
    return <StatusRegion ton="fehler" nachricht={t('portal.nichtGefunden.text')} />;
  }

  return (
    <div className="space-y-4">
      <Link
        to="/portal"
        className="inline-block rounded-sm text-sm text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('portal.zurueck')}
      </Link>
      <BerichtAnsicht view={view} aktion={<PortalDruckAktion informationId={informationId} />} />
    </div>
  );
}
