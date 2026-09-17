import type { ReactNode } from 'react';
import { EntityForm } from '../shared';
import { Aufklapper } from '../../../../shared/ui/aufklapper';
import { quelleAnlegenFormDefaultValues, quelleAnlegenFormSchema } from '../../api/ingestQuelle';
import { useQuelleAnlegenView } from '../../hooks/ingestQuelle';
import { t } from '../../../../shared/i18n/t';

/**
 * „Datenquelle anlegen" — der Weg, einen Broker anzubinden, ohne Zugriff auf
 * die Maschine zu haben, auf der der Worker läuft.
 *
 * **Die Zertifikate sind Textfelder, keine Datei-Auswahl.** Ein PEM-Block ist
 * Text; ihn einzufügen ist der Weg, den jeder kennt, der schon einmal eines
 * ausgestellt hat. Ein Datei-Dialog brächte einen Lese-Umweg mit eigenen
 * Fehlerquellen (falsche Kodierung, DER statt PEM) und nähme die Möglichkeit,
 * den Inhalt vor dem Absenden noch einmal anzusehen.
 *
 * **Das Passwortfeld ist maskiert** (`kind: 'password'`) — nicht, weil der
 * Wert danach noch irgendwo erschiene, sondern weil beim Eintippen jemand
 * daneben stehen kann. `autoComplete="new-password"` hält den Browser davon
 * ab, es als Anmeldedaten dieser Anwendung zu merken.
 */
export function QuelleAnlegenFormular(): ReactNode {
  const view = useQuelleAnlegenView();

  return (
    /*
      Zugeklappt, weil ein Formular mit dreizehn Feldern sonst die Seite
      beherrscht, auf die man kommt, um den BETRIEB zu sehen. Die Beschreibung
      steht auch im geschlossenen Zustand da — zugeklappt ist nicht versteckt.
    */
    <Aufklapper
      // Der Aufklapper benennt den ABSCHNITT, der Knopf darin die AKTION.
      // Beides gleich zu benennen liest sich in einem Screenreader als zwei
      // identische Schaltflaechen mit verschiedener Wirkung.
      titel={t('stammdaten.ingestQuelle.form.aufklapper')}
      hinweis={t('stammdaten.ingestQuelle.form.beschreibung')}
    >
      <EntityForm
        schema={quelleAnlegenFormSchema}
        defaultValues={quelleAnlegenFormDefaultValues}
        submitLabel={t('stammdaten.ingestQuelle.form.action')}
        isSubmitting={view.isSubmitting}
        {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
        {...(view.erfolgsMeldung !== undefined ? { submitSuccessMessage: view.erfolgsMeldung } : {})}
        onValidSubmit={view.anlegen}
        fields={[
          {
            name: 'quelleCode',
            label: t('stammdaten.ingestQuelle.form.quelleCode'),
            kind: 'text',
            hint: t('stammdaten.ingestQuelle.form.quelleCodeHinweis'),
          },
          {
            name: 'bezeichnung',
            label: t('stammdaten.ingestQuelle.form.bezeichnung'),
            kind: 'text',
            hint: t('stammdaten.ingestQuelle.form.bezeichnungHinweis'),
          },
          {
            name: 'brokerHost',
            label: t('stammdaten.ingestQuelle.form.brokerHost'),
            kind: 'text',
            hint: t('stammdaten.ingestQuelle.form.brokerHostHinweis'),
          },
          {
            name: 'topic',
            label: t('stammdaten.ingestQuelle.form.topic'),
            kind: 'text',
            hint: t('stammdaten.ingestQuelle.form.topicHinweis'),
          },
          {
            name: 'clientId',
            label: t('stammdaten.ingestQuelle.form.clientId'),
            kind: 'text',
            hint: t('stammdaten.ingestQuelle.form.clientIdHinweis'),
          },
          {
            name: 'tlsModus',
            label: t('stammdaten.ingestQuelle.form.tlsModus'),
            kind: 'select',
            options: view.tlsOptionen,
            hint: t('stammdaten.ingestQuelle.form.tlsModusHinweis'),
          },
          {
            name: 'benutzername',
            label: t('stammdaten.ingestQuelle.form.benutzername'),
            kind: 'text',
            required: false,
            autoComplete: 'off',
            hint: t('stammdaten.ingestQuelle.form.benutzernameHinweis'),
          },
          {
            name: 'passwort',
            label: t('stammdaten.ingestQuelle.form.passwort'),
            kind: 'password',
            required: false,
            autoComplete: 'new-password',
            hint: t('stammdaten.ingestQuelle.form.passwortHinweis'),
          },
          {
            name: 'caZertifikat',
            label: t('stammdaten.ingestQuelle.form.caZertifikat'),
            kind: 'textarea',
            required: false,
            hint: t('stammdaten.ingestQuelle.form.caZertifikatHinweis'),
          },
          {
            name: 'clientZertifikat',
            label: t('stammdaten.ingestQuelle.form.clientZertifikat'),
            kind: 'textarea',
            required: false,
            hint: t('stammdaten.ingestQuelle.form.clientZertifikatHinweis'),
          },
          {
            name: 'clientSchluessel',
            label: t('stammdaten.ingestQuelle.form.clientSchluessel'),
            kind: 'textarea',
            required: false,
            hint: t('stammdaten.ingestQuelle.form.clientSchluesselHinweis'),
          },
          {
            name: 'notiz',
            label: t('stammdaten.ingestQuelle.form.notiz'),
            kind: 'textarea',
            required: false,
            hint: t('stammdaten.ingestQuelle.form.notizHinweis'),
          },
        ]}
      />
    </Aufklapper>
  );
}
