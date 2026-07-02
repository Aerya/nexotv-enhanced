# Installation facile de NexoTV Enhanced

Ce guide est fait pour une instance publique où chacun configure sa propre liste sans voir celles
des autres. Il suffit de copier-coller les blocs dans l'ordre.

## 1. Créer le dossier

```bash
mkdir -p nexotv-enhanced/data nexotv-enhanced/config
cd nexotv-enhanced
```

## 2. Créer `docker-compose.yml`

Créer un fichier nommé `docker-compose.yml` avec exactement ceci :

```yaml
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
      - ./data:/app/data
      - ./config:/app/config
    restart: unless-stopped
```

## 3. Générer le secret

Sur Linux, un NAS ou un serveur en SSH :

```bash
openssl rand -hex 32
```

Sous Windows PowerShell :

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object ToString x2) -join ''
```

La commande affiche une longue suite de caractères. La copier sans espace.

## 4. Créer `.env`

Créer un fichier nommé `.env` dans le même dossier :

```env
CONFIG_SECRET=COLLER_ICI_LA_LONGUE_VALEUR_GENEREE
```

Ne pas ajouter `WEBUI_PASSWORD` pour une instance publique. C'est normal que la page de
configuration ne demande aucun mot de passe : les visiteurs ne peuvent plus voir de sauvegardes ou
de statistiques communes.

Pour une instance strictement privée, ajouter une deuxième ligne :

```env
WEBUI_PASSWORD=CHOISIR_UN_VRAI_MOT_DE_PASSE
```

Toutes les personnes connaissant ce mot de passe partageront alors les mêmes sauvegardes.

## 5. Démarrer

```bash
docker compose pull
docker compose up -d
```

Ouvrir ensuite `http://ADRESSE-DU-SERVEUR:7000/configure` ou le domaine HTTPS configuré devant le
conteneur.

## 6. Vérifier la sécurité

Remplacer `https://nexotv.exemple.fr` par le vrai domaine :

```bash
curl https://nexotv.exemple.fr/api/capabilities
```

Le résultat doit contenir :

```json
{"encryptionEnabled":true}
```

Puis lancer :

```bash
curl -i https://nexotv.exemple.fr/api/configs
```

Sur une instance publique, le résultat doit commencer par `HTTP/2 403` ou `HTTP/1.1 403`. Si ce
n'est pas le cas, ne pas communiquer l'adresse de l'instance.

## Mise à jour d'une ancienne instance publique

Si des utilisateurs ont déjà vu les configurations des autres, il faut considérer les identifiants
enregistrés comme exposés : changer les mots de passe Xtream, liens M3U privés et MAC Stalker auprès
des fournisseurs concernés.

Mettre ensuite l'image à jour :

```bash
docker compose pull
docker compose up -d
```

Pour effacer définitivement les anciennes sauvegardes et l'historique de l'instance, arrêter le
conteneur puis supprimer la base. **Cette commande efface aussi le cache et ne peut pas être annulée.**

```bash
docker compose down
rm -f data/cache.sqlite data/cache.sqlite-shm data/cache.sqlite-wal
docker compose up -d
```

Refaire enfin les deux vérifications de la section précédente.
