---
title: Joomla
description: Qué responde en un sitio Joomla — el componente Claude Cowork — sus versiones mínimas, sus tipos de registro y lo que solo Joomla ofrece.
---

## Qué responde la llamada

Un sitio Joomla responde a través del **componente Claude Cowork** instalado en él (paquete
`joomla-v…`). Tracy autoriza tu clave y tu asiento, y después retransmite la acción al componente por
la propia puerta del sitio; el componente lee y escribe la base de datos de Joomla a través de la
propia API de Joomla y responde lo que ocurrió. Nada llega a los archivos ni a la base de datos del
sitio por otra vía.

La referencia con la que se escribió este sitio es la versión **0.18.4** del componente.
`GET /v1/sites/{key}` (el `describe` del sitio) informa de la versión que el sitio ejecuta realmente.

## Versiones mínimas

La tabla completa se genera en la página de [Compatibilidad](/es/reference/compatibility/). Las
versiones de las que dependen las rutas `/v1`:

| Ruta | Acción | Componente Joomla |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.18.0 (`native` 0.18.2, varios ids en una lectura 0.18.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0 (`If-Match` → `expected_content_revisions` 0.18.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

Una acción que la versión instalada no tiene responde `400 bad_action`. Actualiza el componente desde
Tracy (el agente puede instalar una versión más reciente mediante `extension.install`) o desde el
propio gestor de extensiones de Joomla.

## Tipos de registro

`{kind}` en las rutas `records` es uno de los tipos escribibles de Joomla: `article`, `category`, `tag`,
`field`, `menuItem`, `menutype`, `redirect`, `banner`, `bannerClient`, `contact`, `newsfeed`,
`language`, `articleAssociation`, `menuAssociation`, `moduleAssignment`, `languageFilter`,
`module`, `templateStyle`, `user`, `extensionParams`. `content.list` usa `article` por defecto.

Los registros se direccionan por su `id` numérico. Los campos son las columnas de la tabla: el
`title`, `introtext`, `fulltext`, `state`, `catid` de un artículo; el `title`, `alias`, `parent_id` de
un elemento de menú. En un elemento de menú, una categoría o una etiqueta existentes, `parent_id` o
`move_after` lo mueve con todo lo que tiene debajo.

## Lo que solo Joomla ofrece

- **Transacciones.** `content.batch` escribe hasta 100 registros en una sola transacción de base de
  datos con comprobaciones previas `expected` — o entran todos o no entra ninguno. Es una acción de la
  puerta Apply, no (todavía) una ruta `/v1`.
- **Operaciones de contrato multilingües y de recorte de demo.** Todas las operaciones
  `multilingual.*`, `demoTrim.*`, `siteLanguage.*` y `sourceLanguage.*` de
  `POST …/contract/{operation}` se responden cuando el quickstart del sitio incluye ese perfil;
  WordPress responde solo `multilingual.retire` y `multilingual.restore`.
- **Instantáneas de base de datos** (`db.snapshot`, `db.rollback`) y **actualizaciones del núcleo**
  (`core.upgrade`) existen en la puerta Apply para los conjuntos de herramientas `site` y `code`; no
  se exponen en `/v1`.

## A qué prestar atención

- **Registros bloqueados.** Un registro abierto en el editor de Joomla (checked out) rechaza una
  escritura con `409 locked` y nombra `lockedBy`. Pide a esa persona que lo cierre; no hay forma de
  escribir por encima.
- **Papelera, no borrado.** `DELETE …/records/{kind}/{id}` establece el estado de papelera del tipo;
  `revert` lo restaura. Los tipos sin estado de papelera se rechazan.
- **Sitios con contrato.** Un sitio construido a partir de un quickstart de Tracy lleva un contrato de
  contenido. Prefiere `POST …/contract/apply` para los slots del diseño: comprueba límites, evidencias
  y bloqueos antes de escribir, y rechaza todo o nada.
