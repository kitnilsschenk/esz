import { createResourceQueryKeys } from '../shared';

// EIGENE Ressourcen-Key-Fabrik (nicht `monitoringKeys` mitbenutzt!) — sonst
// würde `useAusfaelleListe({})` denselben Cache-Schlüssel
// (`['monitoring','liste',{}]`) wie `useVollstaendigkeitListe({})` treffen
// (beide ohne Filter aufgerufen, Betriebs-UI-Konzept Punkt 1/6) und sich
// gegenseitig überschreiben. `ausfall` ist zwar Teil derselben ABAC-Aktion
// (`read:monitoring`) wie `vollstaendigkeit`, aber eine fachlich eigene Liste.
export const ausfallKeys = createResourceQueryKeys('ausfall');
