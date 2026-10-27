---
title: EmDash
description: Un site EmDash n'a pas de plugin Claude Cowork — Tracy le lit par son propre lecteur, et les écritures passent par l'API REST et MCP propre du site.
---

## Ce qui répond à l'appel

Un site **EmDash** ne porte aucun plugin Claude Cowork. Les lectures passent par **le lecteur propre
de Tracy**, qui dialogue avec l'API EmDash du site et répond les mêmes documents de l'API de contenu
que les deux autres CMS : `GET /v1/sites/{key}` (describe), `…/pages`, `…/contents`,
`…/contents/{id}` et `…/changes` fonctionnent tous, avec le même comportement d'`ETag`, de `version`
et de `changedSince`.

Le lecteur n'a pas de version propre à vérifier : il est livré avec Tracy, si bien que le tableau de
[Compatibilité](/fr/reference/compatibility/) n'affiche aucune version minimale dans la colonne
EmDash. Tracy lit ce que le site détient et le dit quand une collection n'a pas de modèle de site.

## Écritures : l'API propre du site

Les routes `records`, les opérations `contract` et les reçus d'annulation sont servis par le plugin
Claude Cowork sur Joomla et WordPress ; un site EmDash n'en a pas, si bien que sur EmDash ils
répondent `501 CONTENT_ADAPTER_UNSUPPORTED` (lectures que le lecteur ne sert pas) ou `unsupported`.

Pour modifier un site EmDash, utilisez **son API REST et MCP propre**, documentée par EmDash sur le
site lui-même à l'adresse `/_emdash/api/openapi.json`, avec les identifiants que ce site délivre.
L'agent Tracy travaille de la même façon : il lit par Tracy et écrit par le MCP d'EmDash.

## Ce qui diffère de Joomla et WordPress

| | Joomla / WordPress | EmDash |
|---|---|---|
| Lectures (`content.read`) | plugin Claude Cowork, à partir de la version 0.18.0 / 0.14.0 | lecteur Tracy, toujours |
| `content.locate` (quel enregistrement a produit un élément) | oui | oui |
| `PATCH` / `DELETE` d'enregistrements, applications de contrat, annulation | plugin | pas par Tracy — l'API propre du site |
| Types de contenu | la carte du CMS établie par le plugin | un type par collection, d'après le `content-api-map.json` du template |
| `native` | type + identifiant du CMS | la collection et l'entrée EmDash |

## Points de vigilance

- Un template qui ne fournit aucun modèle de site répond un `describe` avec ce que le lecteur a pu
  déduire, et le dit ; n'attendez pas d'emplacements sur un tel site.
- `changedSince` a la même limite de 30 minutes / 500 parcours que sur les autres plateformes ; sur
  `409 CONTENT_SNAPSHOT_EXPIRED`, relisez `/pages`.
