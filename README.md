# 🍺 La Taverne des Flâneurs

Site vitrine de la guilde **La Taverne des Flâneurs**, une guilde casual PvE Alliance sur *World of Warcraft: Forever* (EU).

- **Site statique** (HTML/CSS/JS, aucune dépendance) dans `site/`
- **Roster automatique** récupéré depuis l'API Battle.net toutes les 6 heures par GitHub Actions
- **Historique des niveaux** conservé dans `site/data/history.json` (versionné par git) : courbes de progression, top de la semaine, journal d'activité

## Lancer en local

Il faut Node.js 20 ou plus récent.

```bash
npm run demo      # génère des données de démonstration
npm run dev       # site sur http://localhost:8080
```

Pour tester avec les vraies données (une fois les clés Blizzard obtenues) :

```bash
BLIZZARD_CLIENT_ID=xxx BLIZZARD_CLIENT_SECRET=yyy npm run fetch
```

Sous PowerShell :

```powershell
$env:BLIZZARD_CLIENT_ID="xxx"; $env:BLIZZARD_CLIENT_SECRET="yyy"; npm run fetch
```

Le premier vrai passage **efface les données de démo** et démarre l'historique réel.

## Mise en ligne (GitHub Pages)

1. **Clés API Blizzard** : sur <https://develop.battle.net/access/clients>, créez un client (nom libre, URL de redirection `http://localhost`). Notez le *Client ID* et le *Client Secret*.
2. **Dépôt GitHub** : créez un dépôt et poussez ce dossier sur la branche `main`.
3. **Secrets** : *Settings → Secrets and variables → Actions → New repository secret* :
   - `BLIZZARD_CLIENT_ID`
   - `BLIZZARD_CLIENT_SECRET`
4. **Pages** : *Settings → Pages → Source : GitHub Actions*.
5. **Premier passage** : onglet *Actions → Mise à jour du roster → Run workflow*. Le site est ensuite redéployé automatiquement.

Si la guilde n'est pas trouvée, regardez les logs du workflow : le script affiche les slugs essayés. Vous pouvez forcer le bon slug avec une *variable* de dépôt `GUILD_SLUG` (*Settings → Secrets and variables → Actions → Variables*).

## Personnaliser

| Quoi | Où |
|---|---|
| Textes, horaires, FAQ, lien Discord | `site/index.html` (le lien Discord apparaît 5 fois : `discord.gg`) |
| Couleurs, polices | `site/css/style.css` (variables en haut du fichier) |
| Noms des rangs de guilde | `config.json` → `rankNames` (index 0 = maître de guilde) |
| Logo | `site/assets/emblem.svg` |

## Bon à savoir sur l'API WoW Forever

L'API Forever **n'est pas encore documentée par Blizzard** : ce qui suit vient des tests de la communauté (novembre 2026).

- Namespaces : `profile-forever-eu`, `dynamic-forever-eu`, `static-forever-eu`
- Pas de royaumes : un personnage est identifié par `nom-surname`, une guilde par son seul slug
- Un personnage n'apparaît qu'à partir du **niveau 10** et après une déconnexion
- La spécialisation active n'est pas encore exposée

En cas d'erreur de l'API, le script s'arrête **sans écraser** les données : le site garde la dernière version valide.

## Structure

```
config.json                   réglages (région, slug, rangs)
scripts/fetch-roster.mjs      appel API + mise à jour des données
scripts/generate-demo.mjs     données de démonstration
scripts/lib/history.mjs       logique de l'historique
scripts/serve.mjs             serveur local
site/                         le site publié
site/data/*.json              données générées
.github/workflows/            tâche planifiée + déploiement
```

---
Site de fans non officiel. World of Warcraft est une marque de Blizzard Entertainment.
