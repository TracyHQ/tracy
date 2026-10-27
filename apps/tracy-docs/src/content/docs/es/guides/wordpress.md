---
title: WordPress
description: Qué responde en un sitio WordPress — el plugin Claude Cowork — sus versiones mínimas, sus tipos de registro y claves, y en qué se diferencia de Joomla.
---

## Qué responde la llamada

Un sitio WordPress responde a través del **plugin Claude Cowork** instalado en él (paquete
`wordpress-v…`). Tracy autoriza tu clave y tu asiento, y después retransmite la acción al plugin por
la propia puerta del sitio; el plugin lee y escribe a través de las funciones propias de WordPress y
responde lo que ocurrió.

La referencia con la que se escribió este sitio es la versión **0.14.3** del plugin.
`GET /v1/sites/{key}` (el `describe` del sitio) informa de la versión que el sitio ejecuta realmente.

## Versiones mínimas

La tabla completa se genera en la página de [Compatibilidad](/es/reference/compatibility/). Las
versiones de las que dependen las rutas `/v1`:

| Ruta | Acción | Plugin WordPress |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.14.0 (`native` 0.14.2, varios ids en una lectura 0.14.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0 (`If-Match` → `expected_content_revisions` 0.14.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

Una acción que la versión instalada no tiene responde `400 bad_action`. Actualiza el plugin desde
Tracy (el agente puede instalar una versión más reciente mediante `plugin.install`) o desde la
pantalla de Plugins del sitio.

## Tipos de registro y claves

`{kind}` es uno de `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.

- **`post`** cubre todos los tipos de entrada — páginas, entradas, tipos personalizados.
  `GET …/records/post` lista solo entradas; acota con `?post_type=` o busca un slug con `?name=`. Los
  demás tipos se leen de uno en uno.
- **Claves junto a ids.** Una `option` (su nombre) y un `templatePart` (su slug: `header`,
  `footer`) no tienen id numérico: usa `0` como `{id}` y nombra el registro por su clave. Una
  entrada de `postmeta` toma el id de la entrada como `{id}` y la meta key como clave; un `term`
  toma el id del término como `{id}` y la taxonomía como clave; un `menuItem` toma su propio id
  como `{id}` y su menú (slug o nombre) como clave. `GET` y `DELETE` reciben la clave
  como `?key=` en la query (`GET …/records/option/0?key=blogname`); `PATCH` la recibe como `"key"`
  en el cuerpo.
- **Qué se puede borrar.** `DELETE` acepta `post`, `templatePart` y `menuItem`. Borra un
  `menuItem` con su menú como `?key=`: sin ella el borrado funciona igual, pero `revert` no puede
  volver a escribir la entrada. Una `option` y una entrada de `postmeta` no se pueden borrar:
  escribe un valor vacío en su lugar. Un `term` tampoco se puede borrar: `PATCH` lo edita, o
  crea uno con `0` como `{id}` y un `name` (campos: `name`, `slug`, `description`, `parent`).
- Los campos son los propios de WordPress: el `post_title`, `post_content`, `post_status`,
  `post_name` de una entrada; el `value` de una opción.

## En qué se diferencia de Joomla

- **Sin transacción.** WordPress no tiene `content.batch`: varias escrituras son varias solicitudes,
  cada una anotada bajo el mismo `apply_id` si quieres un solo deshacer. Si una falla, las anteriores
  quedan escritas hasta que reviertas el recibo.
- **Operaciones de contrato.** `POST …/contract/{operation}` responde `inspect`, `bind`, `apply`,
  `demoTrim.*` (`plan`, `apply`, `revert`), `siteLanguage.*` y `sourceLanguage.*`; de la familia multilingüe solo `multilingual.retire` y
  `multilingual.restore`. `inspect`/`bind` aceptan `contract`, el perfil contra el que comprobar.
- **Traducciones.** Los idiomas los gestiona el plugin de traducción del sitio (Polylang) a través de
  la acción `content.language` de la puerta Apply (plugin 0.9.0), y las traducciones del núcleo
  mediante `language.install` (0.11.0). Ninguna de las dos es hoy una ruta `/v1`.
- **Temas.** `theme.style` aplica una variación de estilo del tema de bloques activo (0.8.1); los
  temas y plugins se instalan desde la URL de un paquete. Estas acciones necesitan el conjunto de
  herramientas `code` y son acciones de la puerta Apply.
- **Errores fatales.** Un error fatal de PHP dentro del plugin responde `500 fatal` con el archivo y
  la línea; la llamada puede haberse ejecutado en parte — lee el sitio antes de reintentar.

## A qué prestar atención

- **Registros bloqueados.** Una entrada abierta en el editor de bloques rechaza una escritura con
  `409 locked` y nombra `lockedBy`.
- **Papelera solo para entradas.** `DELETE` sobre un `post` usa la propia papelera de WordPress. Un
  `templatePart` o un `menuItem` se borra de forma permanente; `revert` lo vuelve a escribir desde la
  copia guardada con el apply.
- **`itemsCursor`** en `GET …/contents/{id}` se reconoce pero aún no se sirve en WordPress
  (`501 CONTENT_ADAPTER_UNSUPPORTED`); pagina los bloques con `blocksCursor` en su lugar.
