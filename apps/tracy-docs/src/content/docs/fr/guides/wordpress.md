---
title: WordPress
description: Ce qui répond sur un site WordPress — le plugin Claude Cowork — ses versions minimales, ses types d'enregistrement et ses clés, et ce qui diffère de Joomla.
---

## Ce qui répond à l'appel

Un site WordPress répond par le **plugin Claude Cowork** installé sur lui (paquet `wordpress-v…`).
Tracy autorise votre clé et votre siège, puis relaie l'action au plugin par la porte propre du
site ; le plugin lit et écrit par les fonctions propres de WordPress et répond ce qui s'est passé.

La référence sur laquelle ce site a été rédigé est la version **0.14.3** du plugin.
`GET /v1/sites/{key}` (le `describe` du site) indique la version que le site exécute réellement.

## Versions minimales

Le tableau complet est généré sur la page [Compatibilité](/fr/reference/compatibility/). Celles
dont dépendent les routes `/v1` :

| Route | Action | Plugin WordPress |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.14.0 (`native` 0.14.2, plusieurs identifiants en une lecture 0.14.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0 (`If-Match` → `expected_content_revisions` 0.14.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

Une action que la version installée ne connaît pas répond `400 bad_action`. Mettez le plugin à jour
depuis Tracy (l'agent peut installer une version plus récente par `plugin.install`), ou depuis
l'écran des extensions du site.

## Types d'enregistrement et clés

`{kind}` est l'un de `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.

- **`post`** couvre tous les types de publication — pages, articles, types personnalisés.
  `GET …/records/post` ne liste que les articles ; restreignez avec `?post_type=` ou trouvez un slug
  avec `?name=`. Les autres types se lisent un par un.
- **Des clés à côté des identifiants.** Une `option` (son nom) et un `templatePart` (son slug :
  `header`, `footer`) n'ont pas d'identifiant numérique : utilisez `0` comme `{id}` et désignez
  l'enregistrement par sa clé. Une entrée `postmeta` prend l'identifiant de l'article comme `{id}`
  et la clé meta comme clé ; un `term` prend l'identifiant du terme comme `{id}` et la taxonomie
  comme clé ; un `menuItem` prend son propre identifiant comme `{id}` et son menu (slug ou nom)
  comme clé. `GET` et `DELETE` reçoivent la clé en `?key=` dans la query
  (`GET …/records/option/0?key=blogname`) ; `PATCH` la reçoit en `"key"` dans le corps.
- **Ce qui peut être supprimé.** `DELETE` accepte `post`, `templatePart` et `menuItem`. Supprimez
  un `menuItem` avec son menu en `?key=` : sans elle, la suppression réussit quand même, mais
  `revert` ne peut pas réécrire l'entrée. Une `option` et une entrée `postmeta` ne peuvent pas être
  supprimées : écrivez plutôt une valeur vide. Un `term` ne peut pas non plus être supprimé : `PATCH`
  le modifie, ou en crée un avec `0` comme `{id}` et un `name` (champs : `name`, `slug`,
  `description`, `parent`).
- Les champs sont ceux de WordPress : pour un post, `post_title`, `post_content`, `post_status`,
  `post_name` ; pour une option, `value`.

## Ce qui diffère de Joomla

- **Pas de transaction.** WordPress n'a pas de `content.batch` : plusieurs écritures sont plusieurs
  requêtes, chacune enregistrée sous le même `apply_id` si vous voulez une seule annulation. Si
  l'une échoue, les précédentes restent écrites jusqu'à ce que vous annuliez le reçu.
- **Opérations de contrat.** `POST …/contract/{operation}` sert `inspect`, `bind`, `apply`,
  `demoTrim.*` (`plan`, `apply`, `revert`), `siteLanguage.*` et `sourceLanguage.*` ; de la famille multilingue, seulement
  `multilingual.retire` et `multilingual.restore`. `inspect`/`bind` prennent `contract`, le profil
  à vérifier.
- **Traductions.** Les langues sont gérées par le plugin de traduction du site (Polylang) via
  l'action de la porte Apply `content.language` (plugin 0.9.0), et les traductions du noyau par
  `language.install` (0.11.0). Aucune des deux n'est une route `/v1` aujourd'hui.
- **Thèmes.** `theme.style` applique une variation de style du thème de blocs actif (0.8.1) ; thèmes
  et plugins s'installent depuis l'URL d'un paquet. Ces actions exigent le jeu d'outils `code` et
  sont des actions de la porte Apply.
- **Erreurs fatales.** Une erreur fatale PHP dans le plugin répond `500 fatal` avec le fichier et la
  ligne ; l'appel peut avoir été partiellement exécuté — lisez le site avant de réessayer.

## Points de vigilance

- **Enregistrements verrouillés.** Un post ouvert dans l'éditeur de blocs refuse une écriture avec
  `409 locked` et nomme `lockedBy`.
- **Corbeille pour les articles seulement.** `DELETE` sur un `post` utilise la corbeille propre de
  WordPress. Un `templatePart` ou un `menuItem` est supprimé définitivement ; `revert` le réécrit à
  partir de la copie enregistrée avec l'apply.
- **`itemsCursor`** sur `GET …/contents/{id}` est reconnu mais pas encore servi sur WordPress
  (`501 CONTENT_ADAPTER_UNSUPPORTED`) ; paginez les blocs avec `blocksCursor` à la place.
