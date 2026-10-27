---
title: Conceptos
description: Sitios y claves de sitio, asientos, roles y conjuntos de herramientas, el mapa de contenido (contenido, bloque, campo, slot, native), revisiones y versiones, deshacer, y versiones del plugin.
---

## Sitio y clave de sitio

Un **sitio** es un sitio web de cliente que Tracy aloja o ha importado: una instalación de Joomla,
WordPress o EmDash con su propia dirección. Su **clave de sitio** es su nombre canónico (por ejemplo
`shop.example.com`) y aparece en todas las rutas: `/v1/sites/{key}/…`. Un sitio también puede
alcanzarse por un alias; Tracy normaliza la clave antes de autorizar, así que la respuesta es la misma
con cualquiera de los nombres. Una clave desconocida responde `404`.

## Asientos, roles y conjuntos de herramientas

Un **asiento** es la pertenencia de una persona a un sitio, con un **rol**: `owner`, `admin`,
`developer` o `editor`. Un rol concede **conjuntos de herramientas** — las cuatro familias a las que
pertenece toda acción:

| Conjunto de herramientas | Cubre |
|---|---|
| `content` | palabras, imágenes y enlaces: registros, contenidos, applies de contrato, subidas de medios, deshacer |
| `code` | plantillas, módulos, extensiones, temas, plugins y el diseño que definen |
| `site` | los datos del sitio en su conjunto: tablas de base de datos, volcados, instantáneas |
| `lifecycle` | construir, publicar, restaurar y eliminar el sitio |

Qué conjunto de herramientas necesita cada acción está escrito junto a ella en la
[referencia de la API](/es/reference/). El mínimo por defecto es: editor → `content`; developer →
`content`, `code`; admin → `content`, `code`, `site`; owner → todo. Una política de sitio o de espacio
de trabajo puede acotar un rol por debajo de ese mínimo, nunca ampliarlo. Una clave de API añade un
acotamiento más: sus alcances (consulta [Autenticación](/es/authentication/)).

## El mapa de contenido

La Content API describe un sitio con una sola forma sea cual sea el CMS. De fuera hacia dentro:

- **Página** — una dirección del sitio en vivo, en un idioma, que lista los contenidos que muestra.
  `GET /v1/sites/{key}/pages` responde todas las páginas publicadas con una `version` de la lista.
- **Contenido** — una unidad editable: una entrada, un artículo, un menú, una región compartida. Tiene
  un `id`, un `type` (los tipos de contenido del sitio — el `describe` del sitio los lista), un
  `locale`, una `revision`, sus `blocks` y `native`.
- **Bloque** — una parte de un contenido: un encabezado, un párrafo, una imagen, una llamada a la
  acción. Los bloques llevan `fields` y una `visibility` (`visible`, `hidden`, `unknown`) que indica
  si la página en vivo los muestra.
- **Campo** — un valor dentro de un bloque: un texto, un enlace, la ruta de una imagen — el nivel en
  el que las palabras se leen y, a través del registro al que pertenecen, se escriben.
- **Slot** — en un sitio construido a partir de un quickstart de Tracy, una posición con nombre que el
  diseño mantiene ocupada (`hero.0`, `footer.contact`). Los slots son las direcciones de
  `POST …/contract/apply`, que comprueba cada cambio contra el contrato de contenido del sitio antes
  de escribir nada.
- **`native`** — las filas del CMS de las que procede un contenido: el `kind` y el `id` del registro
  (y en WordPress la `key`) que un `PATCH …/records/{kind}/{id}` cambia. Es el puente entre el mapa
  uniforme y los datos propios del sitio; las guías listan los tipos de cada CMS.

`GET /v1/sites/{key}/contents` lista contenidos (filtra por `type` y `locale`, pagina con `limit` y
`cursor`, recorta con `fields`, acota la respuesta con `maxBytes`); `GET …/contents/{id}` lee uno en
detalle, con los bloques paginados mediante `blockId` y `blocksCursor`.

## Registros

Un **registro** es una fila del CMS tal como el sitio la guarda — la superficie bajo el mapa de
contenido. En Joomla: `article`, `category`, `menuItem`, `module`, `templateStyle` y más; en
WordPress: `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`. `GET …/records/{kind}`
lista una página, `GET …/records/{kind}/{id}` lee una fila (los tipos de WordPress sin id numérico
aceptan `?key=`), `PATCH` escribe campos, `DELETE` lo mueve a la papelera. Los registros no tienen
comprobación de revisión — un `PATCH` escribe lo que envías; lee primero, y mantén las escrituras
pequeñas.

## Revisiones, versiones y `changedSince`

- La **`revision`** de un contenido cambia cuando ese contenido cambia. `GET …/contents/{id}` la
  responde como `ETag`; `If-None-Match` con el mismo valor responde `304`.
- La lista de páginas tiene una **`version`**. `GET …/changes?since=<version>` responde lo que cambió
  desde entonces: los contenidos modificados, añadidos o eliminados, y una nueva `version` desde la
  que continuar. Devuelve la última `version` como `If-None-Match` para saber a bajo coste que nada
  ha cambiado.
- **Los límites de `changedSince`, dichos con claridad.** Las versiones se guardan en la memoria del
  proceso de Tracy durante **30 minutos** y como máximo **500 recorridos**; no son un historial
  duradero. Cuando una versión es demasiado antigua, anterior a un reinicio o de otro asiento, la
  respuesta es `409 CONTENT_SNAPSHOT_EXPIRED` — vuelve a leer `/pages` sin `since` y continúa desde
  su nueva `version`.
- **`If-Match`** se respeta solo donde el sitio garantiza la comprobación: `POST …/contract/apply` lo
  pasa como las revisiones de contenido esperadas, y una revisión obsoleta responde `409` con
  `REVISION_STALE`. Los `PATCH`/`DELETE` de registros no aceptan `If-Match`.

## Deshacer: `apply_id` y revertir

Cada escritura se anota bajo un **`apply_id`** — un recibo que nombras en la cabecera `Tracy-Apply-Id`
(o que Tracy nombra por ti: `api-<keyId>-<timestamp>`). Varias escrituras pueden compartir un recibo;
un `DELETE` te exige nombrar uno.

- `GET /v1/sites/{key}/applies` — el historial de auditoría de los applies del sitio.
- `GET …/applies/{id}` — los pasos anotados bajo un recibo (tipo, id, ruta del medio, creado).
- `POST …/applies/{id}/revert` — restaura cada paso, de lo más reciente a lo más antiguo; un registro
  abierto en el editor del CMS rechaza la reversión y la respuesta nombra quién lo tiene abierto
  (`lockedBy`).

Los applies de contrato (`POST …/contract/apply`) se deshacen de la misma manera; sus recibos empiezan
por `contract-`.

## Idempotencia

`PATCH …/records/{kind}/{id}` acepta una cabecera **`Idempotency-Key`**. Reintentar con el mismo valor
tras perder la respuesta devuelve el resultado guardado en lugar de escribir de nuevo. Se pasa al
sitio como el `request_id` del plugin, así que solo existe para las acciones cuyo plugin guarda
resultados — `content.update` (el `PATCH` de registros) y, en Joomla, `content.batch`. Ninguna otra
ruta lo promete.

## Versiones del plugin

En Joomla y WordPress el sitio responde a través del **plugin Claude Cowork** instalado en él, y cada
acción existe a partir de una versión determinada de ese plugin. `GET /v1/sites/{key}` (el
`describe` del sitio) informa de lo que el sitio ejecuta; la página de
[Compatibilidad](/es/reference/compatibility/) lista la versión mínima por acción, y cada guía
explica cómo actualizar. Una acción que la versión instalada no tiene responde `400 bad_action`; una
lectura de la Content API en un plugin anterior a la Content API responde
`501 CONTENT_ADAPTER_UNSUPPORTED`.

Los sitios EmDash no tienen plugin: Tracy los lee a través de su propio lector (consulta la
[guía de EmDash](/es/guides/emdash/)).

## Sistema de diseño

Cada sitio que construye Tracy lleva un **sistema de diseño**: una paleta, una escala tipográfica y
un espaciado con nombre, guardados como propiedades personalizadas de CSS (tokens).
`GET /v1/sites/{key}/design` responde cuál es, de dónde viene (`source`: un sistema del catálogo, la
`brand` propia del cliente, los tokens de un `quickstart`, los de la `template`, o `none`) y los
valores de los tokens que lleva el sitio. Tracy los registra al construir el sitio y de nuevo cada
vez que `theme.style` cambia su aspecto, así que la respuesta sigue al sitio, no a la plantilla de la
que partió. Usa los tokens para que lo que escribas quede dentro de la paleta y las fuentes del sitio:
un color o una fuente fuera de ellos es lo que señala la comprobación de diseño de Tracy.

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

`{"design": null}` es una respuesta, no un error: el sitio no lleva ningún sistema que Tracy conozca.
El ETag sigue a `updatedAt`, así que `If-None-Match` responde `304` hasta que cambie el aspecto.
