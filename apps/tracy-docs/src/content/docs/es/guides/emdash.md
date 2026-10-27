---
title: EmDash
description: Un sitio EmDash no tiene plugin Claude Cowork — Tracy lo lee a través de su propio lector, y las escrituras pasan por la propia API REST y MCP del sitio.
---

## Qué responde la llamada

Un sitio **EmDash** no lleva plugin Claude Cowork. Las lecturas pasan por el **lector propio de
Tracy**, que habla con la API EmDash del sitio y responde los mismos documentos de la Content API que
los otros dos CMS: `GET /v1/sites/{key}` (describe), `…/pages`, `…/contents`, `…/contents/{id}` y
`…/changes` funcionan todos, con el mismo comportamiento de `ETag`, `version` y `changedSince`.

El lector no tiene una versión propia que comprobar: se distribuye con Tracy, así que la tabla de [Compatibilidad](/es/reference/compatibility/)
no muestra ninguna versión mínima en la columna de EmDash. Tracy lee lo que el sitio contiene y lo
indica cuando una colección no tiene modelo de sitio.

## Escrituras: la propia API del sitio

Las rutas `records`, las operaciones `contract` y los recibos de deshacer los responde el plugin
Claude Cowork en Joomla y WordPress; un sitio EmDash no lo tiene, así que en EmDash responden
`501 CONTENT_ADAPTER_UNSUPPORTED` (lecturas que el lector no sirve) o `unsupported`.

Para cambiar un sitio EmDash, usa **su propia API REST y MCP**, documentada por EmDash en el propio
sitio en `/_emdash/api/openapi.json`, con las credenciales que ese sitio emite. El agente de Tracy
trabaja allí de la misma manera: lee a través de Tracy y escribe a través del MCP de EmDash.

## En qué se diferencia de Joomla y WordPress

| | Joomla / WordPress | EmDash |
|---|---|---|
| Lecturas (`content.read`) | plugin Claude Cowork, desde la versión 0.18.0 / 0.14.0 | lector de Tracy, siempre |
| `content.locate` (qué registro imprimió un elemento) | sí | sí |
| `PATCH` / `DELETE` de registros, applies de contrato, deshacer | plugin | no a través de Tracy — la propia API del sitio |
| Tipos de contenido | el mapa del CMS que tiene el plugin | un tipo por colección, del `content-api-map.json` de la plantilla |
| `native` | tipo + id del CMS | la colección y la entrada de EmDash |

## A qué prestar atención

- Una plantilla que no incluye modelo de sitio responde un `describe` con lo que el lector pudo
  inferir, y lo indica; no esperes slots en un sitio así.
- `changedSince` tiene el mismo límite de 30 minutos / 500 recorridos que en las otras plataformas;
  ante `409 CONTENT_SNAPSHOT_EXPIRED` vuelve a leer `/pages`.
