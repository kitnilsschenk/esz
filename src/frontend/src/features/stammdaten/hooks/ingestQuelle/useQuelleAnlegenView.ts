import type { IngestQuelleAnlegen } from '@edms/shared';
import { useIngestQuelleAnlegen } from '../../api/ingestQuelle';
import type { QuelleAnlegenFormValues } from '../../api/ingestQuelle';
import { TLS_MODUS_WERTE } from '../../api/ingestQuelle';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';
import { tlsLabel } from './useIngestQuellenView';
import { t } from '../../../../shared/i18n/t';

export interface QuelleAnlegenView extends MutationViewBasis {
  readonly tlsOptionen: readonly { readonly value: string; readonly label: string }[];
  readonly anlegen: (werte: QuelleAnlegenFormValues) => void;
}

/**
 * „Datenquelle anlegen".
 *
 * **Leere Felder werden WEGGELASSEN, nicht als Leerstring geschickt.** Beim
 * Anlegen ist das gleichbedeutend, beim Ändern nicht — dort bedeutet ein
 * Leerstring „entfernen". Beide Wege dieselbe Übersetzung benutzen zu lassen
 * hieße, sich diesen Unterschied irgendwann einzufangen.
 */
export function useQuelleAnlegenView(): QuelleAnlegenView {
  const mutation = useIngestQuelleAnlegen();

  return {
    tlsOptionen: TLS_MODUS_WERTE.map((wert) => ({ value: wert, label: tlsLabel(wert) })),
    anlegen: (werte) => {
      const body: IngestQuelleAnlegen = {
        quelleCode: werte.quelleCode,
        bezeichnung: werte.bezeichnung,
        brokerHost: werte.brokerHost,
        topic: werte.topic,
        clientId: werte.clientId,
        tlsModus: werte.tlsModus as IngestQuelleAnlegen['tlsModus'],
        ...(werte.benutzername.length > 0 ? { benutzername: werte.benutzername } : {}),
        ...(werte.passwort.length > 0 ? { passwort: werte.passwort } : {}),
        ...(werte.caZertifikat.length > 0 ? { caZertifikat: werte.caZertifikat } : {}),
        ...(werte.clientZertifikat.length > 0 ? { clientZertifikat: werte.clientZertifikat } : {}),
        ...(werte.clientSchluessel.length > 0 ? { clientSchluessel: werte.clientSchluessel } : {}),
        ...(werte.notiz.length > 0 ? { notiz: werte.notiz } : {}),
      };
      mutation.mutate(body);
    },
    ...mutationViewBasis(mutation, t('stammdaten.ingestQuelle.form.erfolg')),
  };
}
