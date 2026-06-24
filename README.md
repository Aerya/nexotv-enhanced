<h1 align="center">NexoTV Enhanced</h1>

<p align="center">
  <strong>Addon Stremio pour IPTV — avec sélection des catégories et catalogues configurables.</strong>
</p>

---

## Origine du projet (attribution)

Ce dépôt est un **fork amélioré** de **[joaosavi/nexotv](https://github.com/joaosavi/nexotv)**, créé par
[@joaosavi](https://github.com/joaosavi) et distribué sous licence **MIT**.

Tout le mérite de l'addon d'origine (architecture, providers Xtream / M3U / IPTV-org, EPG, cache,
sécurité SSRF, etc.) revient à son auteur. Ce dépôt **conserve la licence MIT d'origine** et n'ajoute
qu'une fonctionnalité au-dessus du code amont.

- Code source amont : https://github.com/joaosavi/nexotv
- Documentation d'origine complète (déploiement, Docker, variables d'environnement) :
  **[README.upstream.md](README.upstream.md)**

---

## Ce que cette version ajoute

L'addon d'origine expose **un seul catalogue** dans Stremio, et les catégories du flux IPTV ne sont
disponibles que comme un filtre « genre » à l'intérieur de ce catalogue.

Cette version ajoute, **directement dans la page de configuration web**, la possibilité de :

0. **Étiqueter les catégories par type** — la webui indique pour chaque catégorie si c'est de la
   **TV**, des **Films** ou des **Séries** (Xtream : via `get_live/vod/series_categories` ; M3U :
   d'après le chemin des URLs `/live/` `/movie/` `/series/`), avec un filtre par type. C'est
   **informatif** : les catalogues générés contiennent pour l'instant uniquement les chaînes **TV live**.
1. **Charger les catégories** d'un flux IPTV (Xtream ou M3U) et les afficher avec le nombre de chaînes.
2. **Cocher les catégories** que l'on souhaite garder (filtre, tout sélectionner / désélectionner / inverser).
3. **Choisir la mise en page des catalogues Stremio** :
   - **Un seul catalogue** (`single`) — toutes les catégories choisies sont regroupées dans un seul
     catalogue (les catégories restent disponibles comme filtre de genre à l'intérieur) ;
   - **Un catalogue par catégorie** (`split`) — chaque catégorie sélectionnée devient sa propre
     ligne de catalogue dans Stremio ;
   - **Catalogues personnalisés** (`custom`) — composer ses propres catalogues nommés, chacun
     regroupant une ou plusieurs catégories au choix (p. ex. un catalogue « Divertissement » =
     Films + Séries, un catalogue « Sport » = Sports, etc.). Un catalogue regroupant plusieurs
     catégories conserve un filtre de genre interne.

Si l'on ne touche pas à cette section, le comportement reste **identique à l'addon d'origine**
(toutes les catégories, un seul catalogue) — la fonctionnalité est entièrement rétrocompatible.

> Périmètre : la fonctionnalité concerne les providers **Xtream** et **M3U / M3U+**.
> Le provider **IPTV-org** conserve son sélecteur pays / catégorie existant.

### Comment l'utiliser

1. Ouvrir la page de configuration de l'addon (`/configure`).
2. Onglet **Xtream API** ou **M3U / M3U+** : saisir les identifiants / l'URL de la playlist.
3. Dans la section **Categories**, cliquer sur **Load categories**.
4. Choisir la mise en page (**Single**, **One catalog per category** ou **Custom catalogs**) :
   cocher les catégories voulues, ou en mode *Custom* créer des catalogues nommés et leur
   affecter des catégories.
5. Cliquer sur **Install Addon** : la sélection est encodée dans le token de configuration
   (chiffré si `CONFIG_SECRET` est défini, sinon base64) comme le reste de la configuration.

### Détails techniques

- Champs de configuration : `selectedCategories: string[]`,
  `catalogMode: 'single' | 'split' | 'custom'` et
  `catalogGroups: { name: string; categories: string[] }[]` (mode `custom`).
- Le manifest est généré dynamiquement selon ces champs
  ([`packages/backend/src/addon/manifest.ts`](packages/backend/src/addon/manifest.ts)) :
  - `single` → catalogue `iptv_channels` avec les catégories choisies comme options de genre ;
  - `split` → un catalogue `iptv_cat_<n>` par catégorie sélectionnée ;
  - `custom` → un catalogue `iptv_grp_<n>` par groupe défini (filtre de genre interne si le
    groupe contient plusieurs catégories).
- Le handler de catalogue filtre les chaînes selon le catalogue demandé
  ([`packages/backend/src/addon/builder.ts`](packages/backend/src/addon/builder.ts)).
- Côté frontend, un composant partagé
  [`CategorySelector.vue`](packages/frontend/src/components/CategorySelector.vue) gère la sélection,
  utilisé par `XtreamConfig.vue` et `M3uConfig.vue`. Les catégories Xtream sont lues via
  `get_live_streams`, celles du M3U en analysant les `group-title` de la playlist (les deux via le
  proxy `/api/prefetch` existant pour contourner le mixed-content / CORS).

---

## Démarrage rapide (dev)

```bash
pnpm install
pnpm dev        # backend (port 7000) + frontend (Vite) en parallèle
```

Tests et vérifications :

```bash
pnpm --filter backend exec vitest run      # tests backend
pnpm --filter @nexotv/frontend build       # typecheck (vue-tsc) + build
```

Pour le déploiement (Docker, variables d'environnement, options EPG, etc.), se référer au
**[README amont](README.upstream.md)**.

---

## Licence

MIT — voir [LICENSE](LICENSE). Le copyright d'origine de
[@joaosavi](https://github.com/joaosavi) est conservé ; les ajouts de ce fork sont publiés sous la
même licence.
