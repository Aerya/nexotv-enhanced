<h1 align="center">NexoTV-Enhanced</h1>

<p align="center"><strong><a href="README.en.md">🇬🇧 English version</a></strong></p>

<p align="center">
  <strong>Addon Stremio pour IPTV — <em>chaînes TV en direct</em> avant tout, plus catalogues
  Films &amp; Séries, multi-source, sélection des catégories, authentification et configurations
  sauvegardées.</strong>
</p>

> **La base reste l'IPTV : les chaînes de TV en direct.** L'addon diffuse vos chaînes live (Xtream,
> M3U/M3U+, IPTV-org, Stalker/Ministra) dans Stremio ; les catalogues Films & Séries (Xtream, Stalker)
> viennent **en plus**.

<p align="center">
  <a href="https://upandclear.org/2026/06/24/nexotv-enhanced/">
    <img src="https://img.shields.io/badge/Article-upandclear.org-blue?style=for-the-badge" alt="Article">
  </a>
</p>

> Présentation, installation et captures : **[upandclear.org — NexoTV Enhanced](https://upandclear.org/2026/06/24/nexotv-enhanced/)**

> **Installation sans prise de tête : [guide pas à pas](INSTALLATION-FACILE.md).**

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
| **Chaînes TV (live)** | Le cœur : diffuse vos **chaînes TV en direct** (Xtream, M3U/M3U+, IPTV-org, Stalker) dans Stremio, avec EPG, logos et recherche. *(socle hérité de l'amont, conservé.)* |
| **Multi-source** | Ajouter **plusieurs sources** Xtream/M3U/Stalker mixées dans les mêmes catalogues, avec **déduplication Films/Séries** et choix du flux à la lecture. |
| **Catégories** | La webui charge les catégories du flux, les **étiquette par type** (TV / Films / Séries) et permet de **cocher** celles à garder (filtre, tout / aucun / inverser). |
| **Catalogues** | 3 mises en page : un seul catalogue, un par catégorie, ou des **catalogues personnalisés** (groupes nommés de catégories). |
| **Accueil / Découvrir** | Choisir, par catalogue, lesquels s'affichent sur l'**accueil** ; les autres restent accessibles via **Découvrir**. |
| **Films & Séries (Xtream)** | Les catégories Films/Séries deviennent de **vrais catalogues Stremio** `movie` / `series` jouables (séries avec **saisons + épisodes**). |
| **M3U** | Les entrées `/movie/` sont exposées en catalogues `movie` (lecture directe). |
| **Stalker** | Portail **Stalker / Ministra** (auth par MAC) en source **TV live + films (VOD) + séries** (mono **et** multi-source) ; films/séries enrichis TMDB et dédupliqués, flux résolus à la lecture via `create_link`. |
| **Recherche** | Match **insensible aux accents/séparateurs** (`tf 1` ≈ `TF1`, `asterix` ≈ `Astérix`). |
| **Authentification** | **Mot de passe unique** optionnel sur la webui. |
| **Sauvegarde** | **Configurations sauvegardées côté serveur** (nommées, rechargeables). |
| **Synopsis** | Films & séries avec **synopsis** (genres, casting, réalisateur, année) récupérés à l'ouverture de la fiche. |
| **Enrichissement TMDB** | Clé TMDB (saisie dans la webui) → jaquettes/synopsis/casting **via TMDB** pour Films & Séries, avec **repli sur les données du fournisseur** si le titre n'est pas trouvé. |
| **Statistiques** | Panneau **Statistiques** : journal de visionnage (heure, titre, IP, source/MAC, « en cours ») et nombre de **groupes TV / Films / Séries** par config. |
| **Langue** | Sélecteur **EN / FR** dans l'en-tête (mémorisé dans le navigateur). |
| **Affichage** | Logos de chaînes en affiches carrées ; nom de l'addon `NexoTV-Enhanced`. |

> Entièrement **rétrocompatible** : sans sélection de catégories, le comportement reste celui de
> l'addon d'origine (toutes les chaînes, un seul catalogue).

## Mode public ou mode privé

NexoTV Enhanced propose deux usages volontairement distincts :

| Mode | Fichier `.env` | Comportement |
|---|---|---|
| **Public / communautaire** | `CONFIG_SECRET` uniquement | Chacun crée sa propre URL chiffrée. Les configurations sauvegardées, statistiques et restaurations contenant des identifiants sont désactivées côté serveur. |
| **Privé / foyer** | `CONFIG_SECRET` + `WEBUI_PASSWORD` | La webui demande le mot de passe. Les personnes qui le connaissent partagent les configurations sauvegardées et les statistiques de l'instance. |

`CONFIG_SECRET` ne crée pas de comptes : il chiffre les tokens personnels. `WEBUI_PASSWORD` ne crée
pas non plus de comptes séparés : il ouvre un espace privé commun. Une URL personnelle d'addon doit
toujours rester privée, car elle donne accès aux catalogues correspondants.

---

## Captures d'écran

### Configuration (webui)

| | |
|---|---|
| ![Onglet Xtream API](screenshots/1.png) | ![Sélection des catégories](screenshots/2.png) |
| Onglet **Xtream API** : identifiants puis *Load categories*. | Mise en page + **filtre par type** (TV / Films / Séries). |
| ![Custom catalogs — TV](screenshots/3.png) | ![Custom catalogs — Films](screenshots/4.png) |
| Mode **Custom catalogs** : catalogue « TV King ». | Deux catalogues « TV King » et « Films King ». |
| ![Installation — EPG](screenshots/5.png) | ![Installation — Ready](screenshots/6.png) |
| Overlay d'installation (pré-vol Xtream, EPG). | Manifest prêt → *Open in Stremio* / *Copy URL*. |

![Onglet Multi-source](screenshots/13.png)

*Onglet **Multi-source** : deux sources (King365 + Pierot), catalogues personnalisés et choix de lecture (proposer le choix / lire le 1er dispo).*

### Stremio

| | |
|---|---|
| ![Addon installé](screenshots/7.png) | ![Accueil Stremio](screenshots/8.png) |
| Addon **NexoTV Enhanced** installé. | Catalogues TV King / Films King / Séries King. |
| ![Fiche film + synopsis](screenshots/9.png) | ![Multi-source : choix du flux](screenshots/14.png) |
| Fiche film avec **synopsis**, note et genres. | Un film, **deux flux** (King365 / Prime+) — multi-source. |

### Nuvio

| | | |
|---|---|---|
| ![Accueil Nuvio](screenshots/10.png) | ![Fiche film Nuvio](screenshots/11.png) | ![Lecture Nuvio](screenshots/12.png) |
| Accueil : TV King / Films King / Séries King. | Fiche film : *Lire*, casting. | Lecture (source NexoTV Enhanced). |

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
   - **Custom** — des catalogues nommés, chacun regroupant les catégories de ton choix ; le **filtre
     par type (TV / Films / Séries) est propre à chaque catalogue** lors de la sélection.
4. Section **Sur l'accueil** : cocher les catalogues à afficher sur l'**accueil** Stremio ; ceux
   décochés restent accessibles via **Découvrir** uniquement (techniquement : genre requis →
   hors board mais présent dans Discover).
5. **Install Addon** : la sélection est encodée (et **compressée**) dans le token de configuration,
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

### Stalker / Ministra (TV live + films + séries)

Onglet **Stalker** (et option **Stalker** dans le multi-source) : renseigne l'**URL du portail** et
l'**adresse MAC**, clique **Charger les catégories**, sélectionne et compose tes catalogues comme
pour les autres fournisseurs. La webui indique le **type** de chaque catégorie (TV / Films / Séries).

- Authentification par **handshake + token** (MAC), chemin `/c/portal.php` auto-détecté.
- Catégories TV = **genres ITV** ; **Films** = **VOD** ; **Séries** = `type=series` du portail ;
  listes paginées via `get_ordered_list`.
- Les **films et séries Stalker** sont lisibles : synopsis + `tmdb_id` fournis par le portail,
  enrichis via **TMDB** (clé saisie sur la webui) avec repli sur les données du portail.
- **Séries** : saisons et épisodes récupérés via `movie_id` ; chaque épisode est résolu à la lecture
  via `create_link&type=vod` avec la `cmd` de la saison + le n° d'épisode.
- Les URLs de flux Stalker étant **dynamiques**, elles sont résolues **à la lecture** via
  `create_link` (TV `type=itv`, films/épisodes `type=vod` ; token de lecture éphémère).
- En multi-source, les **films et séries Stalker se dédupliquent** avec ceux d'Xtream/M3U partageant
  le même titre (plusieurs sources → une fiche, plusieurs liens ; épisodes fusionnés par saison/n°).

### Enrichissement TMDB (films & séries)

Renseigne une **clé API TMDB** dans la webui (section *Métadonnées (TMDB)*) pour récupérer de
**belles métadonnées** (jaquette, synopsis, genres, casting, note) sur les fiches Films & Séries.

- Priorité au **`tmdb_id` fourni par le panel** (match exact) ; sinon **recherche TMDB par titre + année**.
- **Repli systématique** : si TMDB ne trouve rien (nommage exotique, contenu hors TMDB…), on **garde
  les données du fournisseur** → rien n'est perdu.
- Langue configurable (FR/EN). Les réponses TMDB sont mises en cache (~7 j).
- Clé optionnelle : sans clé, le comportement reste celui d'avant (métadonnées du fournisseur).

> La clé peut aussi être fournie globalement côté serveur via `TMDB_API_KEY` (la clé de la webui
> a priorité).

### Authentification (mot de passe unique)

- Activée uniquement si **`WEBUI_PASSWORD`** est définie (sinon UI ouverte — rétrocompatible).
- Protège la page de configuration et ses endpoints (`/encrypt`, `/api/prefetch`).
- **Les endpoints addon/flux restent publics** (Stremio/Nuvio ne s'authentifient pas).
- Session par **cookie signé HMAC** (HttpOnly, SameSite=Lax, Secure derrière HTTPS), durée 30 j par
  défaut (`WEBUI_SESSION_TTL_MS`), mot de passe comparé à temps constant, `/api/login` rate-limité.
- Bouton **Déconnexion** dans l'en-tête (à côté du sélecteur EN/FR) quand tu es connecté.
- Quand `WEBUI_PASSWORD` est absent, le configurateur reste public mais toutes les fonctions donnant
  accès à des données globales ou à des identifiants en clair sont coupées côté serveur.

### Statistiques (visionnage & flux)

Panneau **Statistiques** sur la webui (derrière l'authentification) :

- **Visionnage (sortie)** : chaque demande de liens de lecture (`/stream`) est journalisée — **heure,
  titre, type, IP** du demandeur, **source** et **MAC du portail** (Stalker) utilisés. Compteur
  **« en cours (10 min) »** + historique. Journal en SQLite (capé à 2000 entrées / 30 j), effaçable.
  > Limite : l'addon renvoie des **URLs directes** (le lecteur lit chez le fournisseur), il ne voit
  > donc que l'**ouverture** d'un média — pas la **durée réelle** de visionnage.
- **Flux d'entrée** : par configuration sauvegardée, le **nombre de groupes** (catégories) **TV /
  Films / Séries** et le total d'éléments, calculés depuis le cache (sans re-fetch forcé).

### Configurations sauvegardées (côté serveur)

- Bouton **Save configuration** dans chaque provider → enregistre la config courante sous un nom.
- Panneau **Saved configurations** : badge **du bon fournisseur** (Xtream / M3U / Stalker / Multi…),
  **Load** (recharge la config déchiffrée côté serveur et restaure le formulaire) / **Delete**.
- Disponibles uniquement en **mode privé**, lorsque `WEBUI_PASSWORD` est défini.
- Stockées dans **SQLite** (`data/`, persistant via le volume Docker) et **chiffrées au repos** avec
  `CONFIG_SECRET`. Ces configs sont **partagées** entre toutes les personnes connaissant le mot de
  passe : il n'existe pas de comptes séparés.
- En **mode public**, le bouton de sauvegarde et la liste sont masqués, et les routes correspondantes
  répondent `403` même si elles sont appelées directement.
- **Reconfigurer depuis Stremio** : rouvrir la config via le bouton *Configure* de Stremio restaure
  le formulaire même quand le token est chiffré/compressé (déchiffrement serveur, derrière l'auth).

### Multi-source (mixage + déduplication)

Onglet **Multi-source** : ajoute plusieurs sources nommées (Xtream / M3U / Stalker), charge et
sélectionne les catégories **par source**, puis choisis la mise en page (combiné par type / un
catalogue par catégorie / personnalisé) et le **comportement de lecture**.

- **Mixage** : toutes les chaînes sélectionnées des sources sont fusionnées dans les catalogues.
- **Déduplication Films/Séries** : les titres identiques (après normalisation : minuscules, sans
  accents, sans tags `HD/4K/1080p/MULTI/VF…`) sont regroupés en **un seul élément** proposant
  **un flux par source**, toutes sources confondues (Xtream / M3U / Stalker). Les **chaînes TV** ne
  sont pas fusionnées (listées par source, suffixées du nom de la source).
- **Séries** : épisodes fusionnés par (saison, épisode) entre sources (Xtream et Stalker).
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
  active (disjoncteur après 3 échecs). **Réglable par configuration dans la webui** (champ « Mise à
  jour automatique », 1 à 720 h) — surcharge la valeur globale pour cette config.
- **Bootstrap** : la 1ʳᵉ requête de catalogue après un (re)build force un fetch frais (sauf si <2 min).
- **Requêtes conditionnelles** ETag / `If-Modified-Since` → `304 Not Modified` = aucun re-traitement.
- **Cache disque SQLite ~24 h** (`CACHE_TTL_MS`, `M3U_CACHE_TTL_MS`, `IPTV_ORG_CACHE_TTL_MS`),
  **RAM évincée après 5 min** d'inactivité (`DATA_MEMORY_TTL_MS`).
- **EPG** rafraîchi toutes les **8 h** (`EPG_UPDATE_INTERVAL_MS`).
- **Xtream VOD + liste des séries** : récupérés dans le même appel que le live (même cadence). Les
  **épisodes** sont chargés à la demande à chaque ouverture de fiche (toujours frais).
- **Installation non bloquante** : le manifest est servi **immédiatement** et les données sont
  récupérées **en tâche de fond** → aucun timeout à l'installation, même sur un gros panel ou un EPG
  volumineux.

La **structure** des catalogues (lesquels, leurs types) est figée par le token : elle ne change qu'en
**reconfigurant**.

---

## Déploiement (Docker)

Image multi-arch (amd64/arm64) publiée sur GHCR : `ghcr.io/aerya/nexotv-enhanced:latest`.

Pour une première installation ou une mise à jour d'instance publique, suivre le
**[guide d'installation facile](INSTALLATION-FACILE.md)**. Il contient les commandes à copier-coller,
la génération du secret et les deux vérifications de sécurité à effectuer.

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
    environment:
      CONFIG_SECRET: ${CONFIG_SECRET:?Définir CONFIG_SECRET dans le fichier .env}
    volumes:
      - ./data:/app/data     # persistance (cache + configs sauvegardées)
      - ./config:/app/config
    restart: unless-stopped
```

### Variables d'environnement clés

| Variable | Rôle | Défaut |
|---|---|---|
| `ADDON_NAME` | Nom affiché dans Stremio/Nuvio | `NexoTV-Enhanced` |
| `CONFIG_SECRET` | Chiffre les tokens et les sauvegardes ; **obligatoire pour une instance publique** (≥16 car.) | *(aucun)* |
| `WEBUI_PASSWORD` | Active le mode privé commun : webui protégée, sauvegardes et statistiques partagées | *(mode public)* |
| `WEBUI_SESSION_TTL_MS` | Durée de session | `2592000000` (30 j) |
| `TMDB_API_KEY` | Clé TMDB **globale** de repli (la clé saisie dans la webui prime) | *(aucune)* |
| `TMDB_LANGUAGE` | Langue TMDB par défaut | `fr-FR` |
| `EPG_ENABLED` | Mettre `false` pour **désactiver l'EPG partout** (quel que soit le réglage des configs) | `true` |
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
