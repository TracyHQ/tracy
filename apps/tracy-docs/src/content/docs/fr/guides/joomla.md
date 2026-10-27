---
title: Joomla
description: Ce qui répond sur un site Joomla — le composant Claude Cowork — ses versions minimales, ses types d'enregistrement, et ce que seul Joomla offre.
---

## Ce qui répond à l'appel

Un site Joomla répond par le **composant Claude Cowork** installé sur lui (paquet `joomla-v…`).
Tracy autorise votre clé et votre siège, puis relaie l'action au composant par la porte propre du
site ; le composant lit et écrit la base de données de Joomla par l'API propre de Joomla et répond ce
qui s'est passé. Rien n'atteint les fichiers ni la base de données du site par un autre chemin.

La référence sur laquelle ce site a été rédigé est la version **0.18.4** du composant.
`GET /v1/sites/{key}` (le `describe` du site) indique la version que le site exécute réellement.

## Versions minimales

Le tableau complet est généré sur la page [Compatibilité](/fr/reference/compatibility/). Celles
dont dépendent les routes `/v1` :

| Route | Action | Composant Joomla |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.18.0 (`native` 0.18.2, plusieurs identifiants en une lecture 0.18.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0 (`If-Match` → `expected_content_revisions` 0.18.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

Une action que la version installée ne connaît pas répond `400 bad_action`. Mettez le composant à
jour depuis Tracy (l'agent peut installer une version plus récente par `extension.install`), ou
depuis le gestionnaire d'extensions de Joomla.

## Types d'enregistrement

`{kind}` dans les routes `records` est l'un des types modifiables de Joomla : `article`, `category`,
`tag`, `field`, `menuItem`, `menutype`, `redirect`, `banner`, `bannerClient`, `contact`, `newsfeed`,
`language`, `articleAssociation`, `menuAssociation`, `moduleAssignment`, `languageFilter`,
`module`, `templateStyle`, `user`, `extensionParams`. `content.list` prend `article` par défaut.

Les enregistrements sont adressés par leur `id` numérique. Les champs sont les colonnes de la
table : pour un article, `title`, `introtext`, `fulltext`, `state`, `catid` ; pour un élément de menu,
`title`, `alias`, `parent_id`. Sur un élément de menu, une catégorie ou un tag existant, `parent_id`
ou `move_after` le déplace avec tout ce qu'il contient.

## Ce que seul Joomla offre

- **Transactions.** `content.batch` écrit jusqu'à 100 enregistrements dans une seule transaction de
  base de données avec des pré-vérifications `expected` — tout est écrit, ou rien ne l'est. C'est
  une action de la porte Apply, pas (encore) une route `/v1`.
- **Opérations de contrat multilingues et d'élagage de la démo.** Chaque opération
  `multilingual.*`, `demoTrim.*`, `siteLanguage.*` et `sourceLanguage.*` de
  `POST …/contract/{operation}` est servie quand le quickstart du site fournit ce profil ;
  WordPress ne sert que `multilingual.retire` et `multilingual.restore`.
- **Instantanés de base de données** (`db.snapshot`, `db.rollback`) et **mises à niveau du noyau**
  (`core.upgrade`) existent sur la porte Apply pour les jeux d'outils `site` et `code` ; ils ne sont
  pas exposés sur `/v1`.

## Points de vigilance

- **Enregistrements verrouillés.** Un enregistrement ouvert dans l'éditeur de Joomla (extrait,
  « checked out ») refuse une écriture avec `409 locked` et nomme `lockedBy`. Demandez à cette
  personne de le fermer ; il n'existe aucun moyen d'écrire par-dessus.
- **Corbeille, pas suppression.** `DELETE …/records/{kind}/{id}` place l'enregistrement dans l'état
  « corbeille » de son type ; `revert` le rétablit. Les types sans état de corbeille sont refusés.
- **Sites sous contrat.** Un site construit à partir d'un quickstart Tracy porte un contrat de
  contenu. Préférez `POST …/contract/apply` pour les emplacements du design : il vérifie les
  limites, les preuves et les verrous avant d'écrire, et refuse tout ou rien.
