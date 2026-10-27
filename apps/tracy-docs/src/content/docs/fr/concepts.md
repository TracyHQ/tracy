---
title: Concepts
description: Sites et clés de site, sièges, rôles et jeux d'outils, la carte des contenus (contenu, bloc, champ, emplacement, native), révisions et versions, annulation, et versions de plugin.
---

## Site et clé de site

Un **site** est un site web client que Tracy héberge ou a importé : une installation Joomla,
WordPress ou EmDash avec sa propre adresse. Sa **clé de site** est son nom canonique (par exemple
`shop.example.com`) et apparaît dans chaque chemin : `/v1/sites/{key}/…`. Un site peut aussi être
atteint par un alias ; Tracy normalise la clé avant d'autoriser, si bien que la réponse est la même
quel que soit le nom utilisé. Une clé inconnue répond `404`.

## Sièges, rôles et jeux d'outils

Un **siège** est l'appartenance d'une personne à un site, avec un **rôle** : `owner`, `admin`,
`developer` ou `editor`. Un rôle accorde des **jeux d'outils** — les quatre familles auxquelles
appartient chaque action :

| Jeu d'outils | Couvre |
|---|---|
| `content` | les mots, les images et les liens : enregistrements, contenus, applications de contrat, envois de médias, annulation |
| `code` | les templates, modules, extensions, thèmes, plugins et la mise en page qu'ils définissent |
| `site` | les données du site dans leur ensemble : tables de base de données, dumps, instantanés |
| `lifecycle` | construire, publier, restaurer et supprimer le site |

Le jeu d'outils qu'exige chaque action est indiqué à côté d'elle dans la
[référence de l'API](/fr/reference/). Le plancher par défaut est : editor → `content` ;
developer → `content`, `code` ; admin → `content`, `code`, `site` ; owner → tout. Une politique de
site ou d'espace de travail peut restreindre un rôle sous ce plancher, jamais l'élargir. Une clé
d'API ajoute une restriction de plus : ses portées (voir [Authentification](/fr/authentication/)).

## La carte des contenus

L'API de contenu décrit un site sous une seule forme, quel que soit le CMS. De l'extérieur vers
l'intérieur :

- **Page** — une adresse du site en ligne, dans une locale, listant les contenus qu'elle affiche.
  `GET /v1/sites/{key}/pages` répond chaque page publiée avec une `version` de la liste.
- **Contenu** — une unité modifiable : un billet, un article, un menu, une région partagée. Il a un
  `id`, un `type` (les types de contenu du site — le `describe` du site les liste), une `locale`,
  une `revision`, ses `blocks` et `native`.
- **Bloc** — une partie d'un contenu : un titre, un paragraphe, une image, un appel à l'action. Les
  blocs portent des `fields`, et une `visibility` (`visible`, `hidden`, `unknown`) qui dit si la
  page en ligne les affiche.
- **Champ** — une valeur à l'intérieur d'un bloc : un texte, un lien, un chemin d'image — le niveau
  auquel les mots sont lus et, par l'enregistrement auquel ils appartiennent, écrits.
- **Emplacement** — sur un site construit à partir d'un quickstart Tracy, une position nommée que le
  design garde remplie (`hero.0`, `footer.contact`). Les emplacements sont les adresses de
  `POST …/contract/apply`, qui vérifie chaque modification contre le contrat de contenu du site
  avant d'écrire quoi que ce soit.
- **`native`** — les lignes du CMS dont provient un contenu : le `kind` et l'`id` de
  l'enregistrement (et, sur WordPress, la `key`) qu'un `PATCH …/records/{kind}/{id}` modifie. C'est
  le pont entre la carte uniforme et les données propres du site ; les guides listent les types de
  chaque CMS.

`GET /v1/sites/{key}/contents` liste les contenus (filtrez par `type` et `locale`, paginez avec
`limit` et `cursor`, réduisez avec `fields`, bornez la réponse avec `maxBytes`) ;
`GET …/contents/{id}` en lit un en détail, les blocs étant paginés avec `blockId` et `blocksCursor`.

## Enregistrements

Un **enregistrement** est une ligne du CMS telle que le site la détient — la surface sous la carte
des contenus. Sur Joomla : `article`, `category`, `menuItem`, `module`, `templateStyle` et
d'autres ; sur WordPress : `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.
`GET …/records/{kind}` liste une page, `GET …/records/{kind}/{id}` lit une ligne (les types
WordPress sans identifiant numérique prennent `?key=`), `PATCH` écrit des champs, `DELETE` la
déplace vers la corbeille. Les enregistrements n'ont pas de vérification de révision — un `PATCH`
écrit ce que vous envoyez ; lisez d'abord, et gardez les écritures petites.

## Révisions, versions et `changedSince`

- La **`revision`** d'un contenu change quand ce contenu change. `GET …/contents/{id}` la renvoie
  comme `ETag` ; `If-None-Match` avec la même valeur répond `304`.
- La liste des pages a une **`version`**. `GET …/changes?since=<version>` répond ce qui a bougé
  depuis : les contenus modifiés, ajoutés ou supprimés, et une nouvelle `version` à partir de
  laquelle continuer. Renvoyez la dernière `version` dans `If-None-Match` pour apprendre à peu de
  frais que rien n'a bougé.
- **Les limites de `changedSince`, dites clairement.** Les versions sont conservées dans la mémoire
  du processus Tracy pendant **30 minutes** et pour au plus **500 parcours** ; ce n'est pas un
  journal durable. Quand une version est trop ancienne, antérieure à un redémarrage ou issue d'un
  autre siège, la réponse est `409 CONTENT_SNAPSHOT_EXPIRED` — relisez `/pages` sans `since` et
  repartez de sa nouvelle `version`.
- **`If-Match`** n'est honoré que là où le site garantit la vérification : `POST …/contract/apply`
  le transmet comme révisions de contenu attendues, et une révision périmée répond `409` avec
  `REVISION_STALE`. Les `PATCH`/`DELETE` d'enregistrements ne prennent pas `If-Match`.

## Annulation : `apply_id` et revert

Chaque écriture est enregistrée sous un **`apply_id`** — un reçu que vous nommez dans l'en-tête
`Tracy-Apply-Id` (ou que Tracy nomme pour vous : `api-<keyId>-<timestamp>`). Plusieurs écritures
peuvent partager un même reçu ; un `DELETE` vous oblige à en nommer un.

- `GET /v1/sites/{key}/applies` — la piste d'audit des applications du site.
- `GET …/applies/{id}` — les étapes enregistrées sous un reçu (type, identifiant, chemin de média,
  création).
- `POST …/applies/{id}/revert` — rétablit chaque étape, de la plus récente à la plus ancienne ; un
  enregistrement ouvert dans l'éditeur du CMS refuse le revert et la réponse nomme qui le détient
  (`lockedBy`).

Les applications de contrat (`POST …/contract/apply`) s'annulent de la même façon ; leurs reçus
commencent par `contract-`.

## Idempotence

`PATCH …/records/{kind}/{id}` accepte un en-tête **`Idempotency-Key`**. Réessayer avec la même
valeur après une réponse perdue renvoie le résultat mémorisé au lieu d'écrire de nouveau. Il est
transmis au site comme `request_id` du plugin, si bien qu'il n'existe que pour les actions dont le
plugin mémorise les résultats — `content.update` (`PATCH` d'enregistrements) et, sur Joomla,
`content.batch`. Aucune autre route ne le promet.

## Versions de plugin

Sur Joomla et WordPress, le site répond par le **plugin Claude Cowork** installé sur lui, et chaque
action existe à partir d'une version donnée de ce plugin. `GET /v1/sites/{key}` (le `describe` du
site) indique ce que le site exécute ; la page [Compatibilité](/fr/reference/compatibility/)
liste la version minimale par action, et chaque guide explique comment mettre à jour. Une action que
la version installée ne connaît pas répond `400 bad_action` ; une lecture de l'API de contenu sur un
plugin antérieur à l'API de contenu répond `501 CONTENT_ADAPTER_UNSUPPORTED`.

Les sites EmDash n'ont pas de plugin : Tracy les lit par son propre lecteur (voir le
[guide EmDash](/fr/guides/emdash/)).

## Système de design

Chaque site construit par Tracy porte un **système de design** : une palette, une échelle
typographique et des espacements nommés, conservés sous forme de propriétés personnalisées CSS
(tokens). `GET /v1/sites/{key}/design` indique lequel, d'où il vient (`source` : un système du
catalogue, la `brand` propre au client, les tokens d'un `quickstart`, ceux du `template`, ou `none`)
et les valeurs des tokens que porte le site. Tracy les enregistre à la construction du site, puis à
chaque fois que `theme.style` change son apparence : la réponse suit donc le site, pas le modèle de
départ. Utilisez les tokens pour que ce que vous écrivez reste dans la palette et les polices du site —
une couleur ou une police hors de ce cadre est précisément ce que signale la vérification de design de
Tracy.

```json
{
  "design": {
    "id": "apple",
    "name": "Apple",
    "source": "catalog",
    "platform": "wordpress",
    "tokens": { "--accent": "#0071e3", "--font-body": "\"SF Pro Text\", sans-serif" },
    "tokensFrom": "tracy-web:design-tokens.json",
    "updatedAt": "2026-09-29T12:00:00.000Z"
  }
}
```

`{"design": null}` est une réponse, pas une erreur : le site ne porte aucun système connu de Tracy.
L'ETag suit `updatedAt`, donc `If-None-Match` répond `304` tant que l'apparence ne change pas.
