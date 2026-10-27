---
title: Inicio rápido
description: Cinco llamadas con curl — crear una clave, comprobarla, listar las páginas de un sitio, cambiar un título y deshacerlo.
---

Necesitas un asiento en un sitio alojado por Tracy (con cualquier rol) y `curl`. Todas las llamadas de
esta página van a `https://api.tracy.ai` (en el entorno de desarrollo, `https://api.tracy.site`) y
llevan la clave como token Bearer. Nada de lo que sigue usa una sesión de navegador.

## 1. Crea una clave

Abre el sitio en Tracy, ve a **Settings → API keys** y crea una clave para ese sitio. Elige una
etiqueta (por ejemplo `demo laptop`) y los alcances que podrá usar — `content` basta para esta página.

La clave completa se muestra **una sola vez**: `trk_<16 characters>.<32 characters>`. Guárdala donde
guardes tus secretos; Tracy conserva solo un hash de ella. La lista de claves muestra una pista de
cada clave, nunca el secreto.

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. Comprueba en nombre de quién actúa la clave

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

Una clave está vinculada a una cuenta y a un sitio. `siteKey` es el nombre canónico del sitio y el
valor de `{key}` en todas las rutas de abajo.

## 3. Lista las páginas del sitio

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

La respuesta es el documento `pages` de la Content API: cada página publicada con su `contentId`,
`locale`, `url` y `revision`, más una `version` de la lista completa. La respuesta lleva un `ETag`
igual a esa versión; devuélvelo como `If-None-Match` y la respuesta será `304 Not Modified` cuando
nada haya cambiado.

Lee un contenido completo (bloques, campos, las filas del CMS de las que procede):

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

Cada contenido nombra su registro `native` — el tipo y el id del CMS donde viven las palabras. Eso es
lo que cambia el paso siguiente.

## 4. Cambia un título

Los registros son las filas propias del sitio: un `article` de Joomla, un `post` de WordPress,
etcétera. Un `PATCH` escribe los campos indicados de un registro y anota cómo deshacerlo bajo un
`apply_id` que tú eliges (cabecera `Tracy-Apply-Id`; Tracy genera `api-<keyId>-<timestamp>` cuando lo
omites).

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

En Joomla el mismo cambio es `records/article/<id>` con `{ "fields": { "title": "…" } }`. El cambio
está en vivo de inmediato. Reintentar con la misma `Idempotency-Key` tras perder la respuesta
devuelve el resultado guardado en lugar de escribir dos veces.

## 5. Deshazlo

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

Todo lo anotado bajo `quickstart-title-1` vuelve a su estado anterior, de lo más reciente a lo más
antiguo. `GET …/applies/quickstart-title-1` lista lo que contiene el recibo antes de revertirlo.

## Qué leer después

- [Autenticación](/es/authentication/) — qué puede hacer una clave, y qué no podrá hacer nunca.
- [Conceptos](/es/concepts/) — páginas, contenidos, bloques, campos, slots, registros, revisiones y deshacer.
- [Guías](/es/guides/joomla/) — qué cambia en Joomla, WordPress y EmDash.
- [Referencia de la API](/es/reference/) — cada ruta, parámetro y respuesta, con **Test request**.
