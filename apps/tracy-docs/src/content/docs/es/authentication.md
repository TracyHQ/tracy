---
title: Autenticación
description: Claves de API vinculadas a un asiento — qué es una clave, qué puede hacer, cómo se envía, se revoca y se limita, y qué no acepta nunca el host de la API.
---

## Una clave es un asiento, acotado

Toda clave de API pertenece a **una cuenta y un sitio**. Quien la crea debe tener un asiento vigente
en ese sitio, y la clave actúa **como esa persona**: cada lectura y cada escritura se autoriza, se
arrienda y se audita bajo su nombre. No existe una clave que alcance «todos mis sitios» — un sitio,
una clave.

Lo que la clave puede hacer es la intersección de dos cosas:

1. **Los permisos efectivos del asiento** — los conjuntos de herramientas que la política del sitio o
   del espacio de trabajo concede al rol (`owner`, `admin`, `developer`, `editor`). Un owner tiene
   todos los conjuntos de herramientas; un editor, por defecto, solo `content`.
2. **Los alcances de la clave** — un subconjunto de `content`, `code`, `site`, `lifecycle`, elegido al
   crear la clave.

Una clave nunca puede hacer más que el asiento de su propietario. Acotar un rol en la política del
espacio de trabajo acota todas las claves que esa persona creó; conceder a una clave un alcance que
su propietario no tiene no concede nada (la llamada responde `403 TOOLSET_NOT_GRANTED`). Incluso la
clave de un owner con `scopes: ["content"]` no puede cambiar código.

Las lecturas necesitan una clave vigente en el sitio correcto con al menos un alcance. Las rutas
`records` son una superficie en bruto (las filas propias del CMS); las rutas `pages`, `contents` y
`changes` son la vista de la Content API del mismo sitio, y ambas se comprueban de la misma manera.

## Enviar la clave

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- El esquema es `Bearer`, la cabecera es `Authorization`, y la clave es la cadena completa
  `trk_<id>.<secret>`.
- **Solo Bearer, y solo en el host de la API.** `api.tracy.ai` no lee ninguna cookie de sesión: una
  sesión de navegador en `cowork.tracy.ai` no es una credencial aquí, y una solicitud que lleve la
  cookie se trata como si no llevara nada. Una clave ausente o mal formada responde `401 KEY_INVALID`.
- Una clave enviada al propio nombre de host de Tracy (`cowork.tracy.ai`) se ignora: esas rutas
  aceptan la cookie de sesión o la aserción firmada del agente, nunca una clave.
- Las cabeceras que el agente de Tracy usa para nombrar su conversación (`x-tracy-session`,
  `x-tracy-actor`, `x-tracy-workspace-label`) se **descartan** en las solicitudes a `/v1`. El
  arrendamiento que mantiene a dos escritores fuera de un mismo sitio se sostiene bajo la identidad
  propia de la clave (`key:<id>`), decidida por el servidor.

## Ciclo de vida

| Evento | Efecto |
|---|---|
| Creada | La clave completa se muestra una vez. Tracy guarda un hash (HMAC-SHA256 con un pepper del lado del servidor); no puede volver a mostrar el secreto. |
| Usada | `last_used_at` avanza, como máximo una vez por minuto. |
| Expirada (`expires_at`, opcional) | Toda llamada responde `401 KEY_EXPIRED`. |
| Revocada por su propietario | Toda llamada responde `401 KEY_REVOKED`. **La revocación es permanente** — volver a conceder el asiento más tarde no recupera la clave. |
| Asiento del propietario revocado | Toda llamada responde `403 SEAT_NOT_AUTHORIZED` de inmediato; el asiento se comprueba en cada solicitud, no se guarda en caché. |
| Sitio eliminado | La clave se elimina con él. |

Las claves se gestionan en la pantalla Settings de Tracy, o a través de las puertas de cuenta en el
propio nombre de host de Tracy (`GET /api/me/keys`, `POST /api/me/keys`, `DELETE /api/me/keys/{id}`),
que aceptan la sesión de navegador — nunca una clave.

## No incrustes claves en un frontend

Una clave es un secreto con el mismo poder que tu asiento. Guárdala en un servidor, en un secreto de
CI o en una herramienta local; nunca en una página, una app móvil o un repositorio público. En `/v1`, la API responde a un navegador desde un único origen — el de esta documentación, para el
botón **Test request** de la [referencia](/es/reference/) — y nunca con credenciales, así que una
página en otro origen no puede llamarla con una clave ni siquiera por error. **Test request** no guarda
nada: una clave escrita allí vive solo en esa pestaña.

## Límites de tasa

Los límites son por clave, en dos cubos, y se cuentan antes de que la llamada llegue al sitio:

| Cubo | Límite | Qué cuenta |
|---|---|---|
| read | 6.000 por hora | toda ruta que no cambia nada |
| write | 600 por hora | toda ruta que cambia el sitio (`PATCH`, `DELETE`, `POST …/contract/*`, `POST …/revert`) |

Por encima del límite la respuesta es `429 RATE_LIMITED` con una cabecera `Retry-After` que indica los
segundos que faltan para que se abra la siguiente ventana. El contador falla cerrado: si no se puede
leer, la llamada se rechaza en lugar de dejarla pasar.

## Códigos de error de esta capa

| Estado | Código | Significado |
|---|---|---|
| 401 | `KEY_INVALID` | No hay `Authorization: Bearer trk_…`, o la clave no existe o su secreto no coincide. |
| 401 | `KEY_REVOKED` | La clave fue revocada. Crea una nueva. |
| 401 | `KEY_EXPIRED` | El `expires_at` de la clave ya pasó. Crea una nueva. |
| 403 | `SEAT_NOT_AUTHORIZED` | El propietario de la clave no tiene un asiento vigente en este sitio (el asiento fue revocado, o la ruta nombra otro sitio). |
| 403 | `TOOLSET_NOT_GRANTED` | La acción necesita un conjunto de herramientas fuera de los alcances de la clave ∩ los permisos del asiento; la respuesta nombra `toolset` y `role`. |
| 429 | `RATE_LIMITED` | Se superó uno de los dos cubos; espera `Retry-After` segundos. |

Todos los demás rechazos — incluidas las respuestas propias del sitio — están en la página de
[Errores](/es/reference/errors/).
