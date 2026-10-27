---
title: Authentification
description: Clés d'API liées à un siège — ce qu'est une clé, ce qu'elle peut faire, comment elle est envoyée, révoquée et limitée en débit, et ce que l'hôte de l'API n'accepte jamais.
---

## Une clé est un siège, restreint

Chaque clé d'API appartient à **un compte et un site**. La personne qui la crée doit détenir un siège
actif sur ce site, et la clé agit **en tant que cette personne** : chaque lecture et chaque écriture
est autorisée, soumise au bail d'écriture et auditée sous son nom. Il n'existe pas de clé qui
atteigne « tous mes sites » — un site, une clé.

Ce que la clé peut faire est l'intersection de deux choses :

1. **Les permissions effectives du siège** — les jeux d'outils que la politique du site ou de
   l'espace de travail accorde au rôle (`owner`, `admin`, `developer`, `editor`). Un propriétaire
   détient tous les jeux d'outils ; un éditeur, par défaut, seulement `content`.
2. **Les portées de la clé** — un sous-ensemble de `content`, `code`, `site`, `lifecycle`, choisi à
   la création de la clé.

Une clé ne peut jamais faire plus que le siège de son propriétaire. Restreindre un rôle dans la
politique de l'espace de travail restreint toutes les clés que cette personne a créées ; accorder à
une clé une portée que son propriétaire n'a pas n'accorde rien (l'appel répond
`403 TOOLSET_NOT_GRANTED`). Même la clé d'un propriétaire avec `scopes: ["content"]` ne peut pas
modifier le code.

Les lectures exigent une clé active sur le bon site avec au moins une portée. Les routes `records`
sont une surface brute (les lignes propres du CMS) ; les routes `pages`, `contents` et `changes` sont
la vue de l'API de contenu sur le même site, et les deux sont vérifiées de la même façon.

## Envoyer la clé

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- Le schéma est `Bearer`, l'en-tête est `Authorization`, et la clé est la chaîne
  `trk_<id>.<secret>` entière.
- **Bearer uniquement, sur l'hôte de l'API uniquement.** `api.tracy.ai` ne lit aucun cookie de
  session : une session de navigateur sur `cowork.tracy.ai` n'est pas un identifiant ici, et une
  requête portant le cookie est traitée comme si elle ne portait rien. Une clé absente ou mal formée
  répond `401 KEY_INVALID`.
- Une clé envoyée au nom d'hôte propre de Tracy (`cowork.tracy.ai`) est ignorée : ces routes prennent
  le cookie de session ou l'assertion signée de l'agent, jamais une clé.
- Les en-têtes que l'agent Tracy utilise pour nommer sa conversation (`x-tracy-session`,
  `x-tracy-actor`, `x-tracy-workspace-label`) sont **supprimés** des requêtes `/v1`. Le bail
  d'écriture qui empêche deux rédacteurs d'écrire en même temps sur un site est détenu sous
  l'identité propre de la clé (`key:<id>`), décidée par le serveur.

## Cycle de vie

| Événement | Effet |
|---|---|
| Créée | La clé complète est affichée une seule fois. Tracy en stocke un hachage (HMAC-SHA256 avec un poivre côté serveur) ; il ne peut plus jamais afficher le secret. |
| Utilisée | `last_used_at` avance, au plus une fois par minute. |
| Expirée (`expires_at`, facultatif) | Chaque appel répond `401 KEY_EXPIRED`. |
| Révoquée par son propriétaire | Chaque appel répond `401 KEY_REVOKED`. **La révocation est définitive** — réaccorder le siège plus tard ne fait pas revenir la clé. |
| Siège du propriétaire révoqué | Chaque appel répond aussitôt `403 SEAT_NOT_AUTHORIZED` ; le siège est vérifié à chaque requête, jamais mis en cache. |
| Site supprimé | La clé est supprimée avec lui. |

Les clés se gèrent dans les paramètres de Tracy, ou par les portes de compte sur le nom d'hôte propre
de Tracy (`GET /api/me/keys`, `POST /api/me/keys`, `DELETE /api/me/keys/{id}`), qui prennent la
session de navigateur — jamais une clé.

## N'intégrez pas de clé dans un frontend

Une clé est un secret dont l'étendue est celle de votre siège. Gardez-la sur un serveur, dans un
secret de CI ou dans un outil local ; jamais dans une page, une application mobile ou un dépôt
public. Sur `/v1`, l'API ne répond à un navigateur que depuis une seule origine — celle de cette
documentation, pour le bouton **Test request** de la [référence](/fr/reference/) — et jamais avec des
identifiants, si bien qu'une page sur une autre origine ne peut pas l'appeler avec une clé, même par
erreur. **Test request** ne stocke rien : une clé saisie là ne vit que dans cet onglet.

## Limites de débit

Les limites s'appliquent par clé, dans deux compartiments, et sont comptées avant que l'appel
n'atteigne le site :

| Compartiment | Limite | Ce qui compte |
|---|---|---|
| read | 6 000 par heure | chaque route qui ne modifie rien |
| write | 600 par heure | chaque route qui modifie le site (`PATCH`, `DELETE`, `POST …/contract/*`, `POST …/revert`) |

Au-delà de la limite, la réponse est `429 RATE_LIMITED` avec un en-tête `Retry-After` donnant le
nombre de secondes avant l'ouverture de la fenêtre suivante. Le compteur est à sécurité fermée
(fail-closed) : s'il ne peut pas être lu, l'appel est refusé plutôt que laissé passer.

## Codes d'erreur de cette couche

| Statut | Code | Signification |
|---|---|---|
| 401 | `KEY_INVALID` | Pas d'`Authorization: Bearer trk_…`, ou la clé n'existe pas, ou son secret ne correspond pas. |
| 401 | `KEY_REVOKED` | La clé a été révoquée. Créez-en une nouvelle. |
| 401 | `KEY_EXPIRED` | La date `expires_at` de la clé est dépassée. Créez-en une nouvelle. |
| 403 | `SEAT_NOT_AUTHORIZED` | Le propriétaire de la clé ne détient aucun siège actif sur ce site (le siège a été révoqué, ou le chemin nomme un autre site). |
| 403 | `TOOLSET_NOT_GRANTED` | L'action exige un jeu d'outils hors de l'intersection des portées de la clé et des permissions du siège ; la réponse nomme `toolset` et `role`. |
| 429 | `RATE_LIMITED` | L'un des deux compartiments est dépassé ; attendez `Retry-After` secondes. |

Tout autre refus — y compris les réponses propres du site — figure sur la page
[Erreurs](/fr/reference/errors/).
