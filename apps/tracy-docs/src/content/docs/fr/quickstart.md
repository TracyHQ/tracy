---
title: Démarrage rapide
description: Cinq appels curl — créer une clé, la vérifier, lister les pages d'un site, modifier un titre et annuler cette modification.
---

Il vous faut un siège sur un site hébergé par Tracy (quel que soit le rôle) et `curl`. Chaque appel
ci-dessous s'adresse à `https://api.tracy.ai` (sur l'environnement de développement,
`https://api.tracy.site`) et transporte la clé comme jeton Bearer. Rien ici n'utilise une session de
navigateur.

## 1. Créer une clé

Ouvrez le site dans Tracy, allez dans **Settings → API keys** et créez une clé pour ce site.
Choisissez un libellé (par exemple `demo laptop`) et les portées qu'elle pourra utiliser — `content`
suffit pour cette page.

La clé complète n'est affichée qu'**une seule fois** : `trk_<16 characters>.<32 characters>`.
Conservez-la là où vous gardez vos secrets ; Tracy n'en garde qu'un hachage. La liste des clés
affiche un indice de chaque clé, jamais le secret.

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. Vérifier au nom de qui la clé agit

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

Une clé est liée à un compte et à un site. `siteKey` est le nom canonique du site et la valeur de
`{key}` dans chaque chemin ci-dessous.

## 3. Lister les pages du site

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

La réponse est le document `pages` de l'API de contenu : chaque page publiée avec son `contentId`,
sa `locale`, son `url` et sa `revision`, plus une `version` de la liste entière. La réponse porte un
`ETag` égal à cette version ; renvoyez-le dans `If-None-Match` et la réponse est `304 Not Modified`
quand rien n'a bougé.

Lisez un contenu en entier (blocs, champs, les lignes du CMS dont il provient) :

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

Chaque contenu nomme son enregistrement `native` — le type et l'identifiant du CMS où vivent les
mots. C'est ce que l'étape suivante modifie.

## 4. Modifier un titre

Les enregistrements sont les lignes propres du site : un `article` Joomla, un `post` WordPress, etc.
Un `PATCH` écrit les champs donnés d'un enregistrement et consigne la façon de l'annuler sous un
`apply_id` que vous choisissez (en-tête `Tracy-Apply-Id` ; Tracy génère `api-<keyId>-<timestamp>`
si vous l'omettez).

```bash
curl -s -X PATCH "$TRACY_API/sites/shop.example.com/records/post/42" \
  -H "Authorization: Bearer $TRACY_KEY" \
  -H "Content-Type: application/json" \
  -H "Tracy-Apply-Id: quickstart-title-1" \
  -H "Idempotency-Key: quickstart-title-1-try-1" \
  -d '{ "fields": { "post_title": "Fresh bread every morning" } }'
```

```json
{ "kind": "post", "id": 42, "created": false }
```

Sur Joomla, la même modification s'écrit `records/article/<id>` avec `{ "fields": { "title": "…" } }`.
La modification est en ligne immédiatement. Réessayer avec la même `Idempotency-Key` après une
réponse perdue renvoie le résultat mémorisé au lieu d'écrire deux fois.

## 5. Annuler la modification

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

Tout ce qui a été enregistré sous `quickstart-title-1` est rétabli, du plus récent au plus ancien.
`GET …/applies/quickstart-title-1` liste ce que contient le reçu avant que vous ne l'annuliez.

## Que lire ensuite

- [Authentification](/fr/authentication/) — ce qu'une clé peut faire, et ce qu'elle ne peut jamais faire.
- [Concepts](/fr/concepts/) — pages, contenus, blocs, champs, emplacements, enregistrements, révisions et annulation.
- [Guides](/fr/guides/joomla/) — ce qui diffère sur Joomla, WordPress et EmDash.
- [Référence de l'API](/fr/reference/) — chaque route, paramètre et réponse, avec **Test request**.
