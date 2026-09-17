import { createResourceQueryKeys } from '../shared';

// EIGENE Ressourcen-Key-Fabrik, wie `ausfallKeys` und aus demselben Grund:
// die Wiedervorlage teilt zwar die ABAC-Aktion `read:monitoring` mit
// Vollständigkeit und Ausfällen, ist aber eine fachlich eigene Liste und darf
// deren Cache nicht treffen.
export const einschraenkungFristKeys = createResourceQueryKeys('einschraenkung-frist');
