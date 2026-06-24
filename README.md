<h1 align="center">NexoTV-Enhanced</h1>

<p align="center">
  <strong>Addon Stremio pour IPTV — sélection des catégories, catalogues configurables,
  Films &amp; Séries Xtream, authentification et configurations sauvegardées.</strong>
</p>

---

## Origine du projet (attribution)

Ce dépôt est un **fork amélioré** de **[joaosavi/nexotv](https://github.com/joaosavi/nexotv)**,
créé par [@joaosavi](https://github.com/joaosavi) et distribué sous licence **MIT**.

Tout le mérite de l'addon d'origine (architecture, providers Xtream / M3U / IPTV-org, EPG, cache,
sécurité SSRF, etc.) revient à son auteur. Ce dépôt **conserve la licence MIT** et ajoute des
fonctionnalités au-dessus du code amont.

- Code source amont : https://github.com/joaosavi/nexotv
- Documentation d'origine complète (déploiement détaillé, toutes les variables d'env, EPG…) :
  **[README.upstream.md](README.upstream.md)**

---

## Ce que cette version ajoute

| Domaine | Ajout |
|---|---|
| **Multi-source** | Ajouter **plusieurs sources** Xtream/M3U mixées dans les mêmes catalogues, avec **déduplication Films/Séries** et choix du flux à la lecture. |
| **Catégories** | La webui charge les catégories du flux, les **étiquette par type** (TV / Films / Séries) et permet de **cocher** celles à garder (filtre, tout / aucun / inverser). |
| **Catalogues** | 3 mises en page : un seul catalogue, un par catégorie, ou des **catalogues personnalisés** (groupes nommés de catégories). |
| **Films & Séries (Xtream)** | Les catégories Films/Séries deviennent de **vrais catalogues Stremio** `movie` / `series` jouables (séries avec **saisons + épisodes**). |
| **M3U** | Les entrées `/movie/` sont exposées en catalogues `movie` (lecture directe). |
| **Recherche** | Match **insensible aux accents/séparateurs** (`tf 1` ≈ `TF1`, `asterix` ≈ `Astérix`). |
| **Authentification** | **Mot de passe unique** optionnel sur la webui. |
| **Sauvegarde** | **Configurations sauvegardées côté serveur** (nommées, rechargeables). |
| **Affichage** | Logos de chaînes en affiches carrées ; nom de l'addon `NexoTV-Enhanced`. |

> Entièrement **rétrocompatible** : sans sélection de catégories, le comportement reste celui de
> l'addon d'origine (toutes les chaînes, un seul catalogue).

---

## Fonctionnalités en détail

### Catégories & catalogues

1. Page de configuration (`/configure`) → onglet **Xtream API** ou **M3U / M3U+** → saisir les
   identifiants / l'URL de la playlist.
2. Section **Categories** → **Load categories** : la liste s'affiche avec, pour chaque catégorie, un
   badge **TV / Movie / Series** et le nombre de chaînes.
   - Xtream : types lus via `get_live/vod/series_categories`.
   - M3U : types déduits du chemin des URLs (`/live/` `/movie/` `/series/`).
3. Cocher les catégories voulues, puis choisir la **mise en page** :
   - **Single** — toutes les catégories réunies en un catalogue (les catégories restent un filtre de
     genre interne) ;
   - **Split** — un catalogue par catégorie ;
   - **Custom** — des catalogues nommés, chacun regroupant les catégories de ton choix.
4. **Install Addon** : la sélection est encodée (et **compressée**) dans le token de configuration,
   chiffré si `CONFIG_SECRET` est défini.

### Films & Séries (Xtream)

Sélectionner une catégorie **Films** ou **Séries** en Xtream crée un catalogue Stremio typé :

- **Films** → type `movie`, lecture directe du fichier (`/movie/USER/PASS/id.ext`).
- **Séries** → type `series` : la fiche affiche **saisons + épisodes**, chargés à l'ouverture via
  `get_series_info` (pas de pré-téléchargement massif), chaque épisode jouable.

Le type du catalogue suit le type de la catégorie : *split* → un catalogue par catégorie (du bon
type) ; *custom* → un catalogue par groupe (type dominant) ; *single* → un catalogue **par type**
(TV / Movies / Series). Côté **M3U**, les films (`/movie/`) deviennent des catalogues `movie` ; les
séries restent à plat (un M3U ne porte pas d'arborescence saison/épisode).

> Dans Stremio/Nuvio, les catalogues sont rangés **par type** : un catalogue Films apparaît sous
> *Discover → Movies*, un catalogue Séries sous *Discover → Series*.

### Authentification (mot de passe unique)

- Activée uniquement si **`WEBUI_PASSWORD`** est définie (sinon UI ouverte — rétrocompatible).
- Protège la page de configuration et ses endpoints (`/encrypt`, `/api/prefetch`).
- **Les endpoints addon/flux restent publics** (Stremio/Nuvio ne s'authentifient pas).
- Session par **cookie signé HMAC** (HttpOnly, SameSite=Lax, Secure derrière HTTPS), durée 30 j par
  défaut (`WEBUI_SESSION_TTL_MS`), mot de passe comparé à temps constant, `/api/login` rate-limité.

### Configurations sauvegardées (côté serveur)

- Bouton **Save configuration** dans chaque provider → enregistre la config courante sous un nom.
- Panneau **Saved configurations** : **Load** (recharge le formulaire via `/{token}/configure`) /
  **Delete**.
- Stockées dans **SQLite** (`data/`, persistant via le volume Docker), **chiffrées au repos** si
  `CONFIG_SECRET` est défini. Avec un mot de passe unique, ces configs sont **partagées** (pas de
  comptes séparés).

### Multi-source (mixage + déduplication)

Onglet **Multi-source** : ajoute plusieurs sources nommées (Xtream / M3U), charge et sélectionne les
catégories **par source**, puis choisis la mise en page (combiné par type / un catalogue par
catégorie) et le **comportement de lecture**.

- **Mixage** : toutes les chaînes sélectionnées des sources sont fusionnées dans les catalogues.
- **Déduplication Films/Séries** : les titres identiques (après normalisation : minuscules, sans
  accents, sans tags `HD/4K/1080p/MULTI/VF…`) sont regroupés en **un seul élément** proposant
  **un flux par source**. Les **chaînes TV** ne sont pas fusionnées (listées par source, suffixées
  du nom de la source).
- **Séries** : épisodes fusionnés par (saison, épisode) entre sources (Xtream).
- **Lecture** (`streamSelection`, réglable dans la webui) :
  - **Proposer le choix** → Stremio liste un flux par source (IPTV1 / IPTVPerso…) ;
  - **Lire le 1er dispo** → seul le flux de la source prioritaire (ordre des sources).
- **Limites** : pas d'EPG en multi-source pour l'instant ; côté M3U les séries restent à plat
  (un M3U ne porte pas d'arborescence saison/épisode), seuls les films M3U sont dédupliqués.

> Les configs mono-source restent inchangées et pleinement supportées.

---

## Rafraîchissement des flux & catalogues

Les données sont récupérées à la demande puis mises en cache ; les catalogues reflètent toujours la
liste de chaînes courante.

- **Auto-refresh** en arrière-plan toutes les **4 h** (`UPDATE_INTERVAL_MS`) tant que l'instance est
  active (disjoncteur après 3 échecs).
- **Bootstrap** : la 1ʳᵉ requête de catalogue après un (re)build force un fetch frais (sauf si <2 min).
- **Requêtes conditionnelles** ETag / `If-Modified-Since` → `304 Not Modified` = aucun re-traitement.
- **Cache disque SQLite ~24 h** (`CACHE_TTL_MS`, `M3U_CACHE_TTL_MS`, `IPTV_ORG_CACHE_TTL_MS`),
  **RAM évincée après 5 min** d'inactivité (`DATA_MEMORY_TTL_MS`).
- **EPG** rafraîchi toutes les **8 h** (`EPG_UPDATE_INTERVAL_MS`).
- **Xtream VOD + liste des séries** : récupérés dans le même appel que le live (même cadence). Les
  **épisodes** sont chargés à la demande à chaque ouverture de fiche (toujours frais).

La **structure** des catalogues (lesquels, leurs types) est figée par le token : elle ne change qu'en
**reconfigurant**.

---

## Déploiement (Docker)

Image multi-arch (amd64/arm64) publiée sur GHCR : `ghcr.io/aerya/nexotv-enhanced:latest`.

```yaml
# docker-compose.yml
services:
  nexotv:
    image: ghcr.io/aerya/nexotv-enhanced:latest
    container_name: nexotv-enhanced
    ports:
      - "7000:7000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data     # persistance (cache + configs sauvegardées)
      - ./config:/app/config
    restart: unless-stopped
```

### Variables d'environnement clés

| Variable | Rôle | Défaut |
|---|---|---|
| `ADDON_NAME` | Nom affiché dans Stremio/Nuvio | `NexoTV-Enhanced` |
| `CONFIG_SECRET` | Active le chiffrement AES-256-GCM des tokens **et** des configs sauvegardées (≥16 car.) | *(aucun)* |
| `WEBUI_PASSWORD` | Mot de passe de la webui (vide = UI ouverte) | *(aucun)* |
| `WEBUI_SESSION_TTL_MS` | Durée de session | `2592000000` (30 j) |
| `UPDATE_INTERVAL_MS` | Intervalle d'auto-refresh des chaînes | `14400000` (4 h) |
| `EPG_UPDATE_INTERVAL_MS` | Intervalle de refresh EPG | `28800000` (8 h) |
| `CACHE_TTL_MS` | TTL du cache disque | `86400000` (24 h) |

> Voir [`.env.example`](.env.example) et le [README amont](README.upstream.md) pour la liste complète.

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

---

## Détails techniques

- **Manifest dynamique** ([`manifest.ts`](packages/backend/src/addon/manifest.ts)) : `single` →
  `iptv_channels` (+ `iptv_movies` / `iptv_series` selon les types) ; `split` → `iptv_cat_<n>` ;
  `custom` → `iptv_grp_<n>`. `types[]` calculé dynamiquement.
- **Champs de config** : `selectedCategories`, `catalogMode` (`single|split|custom`),
  `catalogGroups`, `categoryTypes`.
- **Résolution catalogue/flux/méta** : [`M3UEPGAddon.ts`](packages/backend/src/addon/M3UEPGAddon.ts)
  (`resolveCatalog`, `itemsForCatalog`, `parseId`, `buildSeriesMeta`).
- **Token compressé (gzip) + chiffré** : [`cryptoConfig.ts`](packages/backend/src/utils/cryptoConfig.ts).
- **Auth** : [`webauth.ts`](packages/backend/src/utils/webauth.ts) — **Stockage configs** :
  [`configStore.ts`](packages/backend/src/utils/configStore.ts).
- **Frontend** (Vue 3) : [`CategorySelector.vue`](packages/frontend/src/components/CategorySelector.vue),
  [`SavedConfigs.vue`](packages/frontend/src/components/SavedConfigs.vue),
  [`LoginGate.vue`](packages/frontend/src/components/LoginGate.vue).

---

## Licence

MIT — voir [LICENSE](LICENSE). Le copyright d'origine de
[@joaosavi](https://github.com/joaosavi) est conservé ; les ajouts de ce fork sont publiés sous la
même licence.
