---
title: EmDash
description: Eine EmDash-Site hat kein Claude-Cowork-Plugin — Tracy liest sie über seinen eigenen Reader, und Schreibvorgänge laufen über die eigene REST- und MCP-API der Site.
---

## Was den Aufruf beantwortet

Eine **EmDash**-Site trägt kein Claude-Cowork-Plugin. Lesevorgänge laufen über **Tracys eigenen Reader**,
der mit der EmDash-API der Site spricht und dieselben Content-API-Dokumente beantwortet wie die beiden
anderen CMS: `GET /v1/sites/{key}` (describe), `…/pages`, `…/contents`, `…/contents/{id}` und `…/changes`
funktionieren alle, mit demselben Verhalten von `ETag`, `version` und `changedSince`.

Der Reader hat kein eigenes Release, das zu prüfen wäre: er wird mit Tracy ausgeliefert, daher zeigt die
Tabelle [Kompatibilität](/de/reference/compatibility/) in der EmDash-Spalte keine Mindestversion.
Tracy liest, was die Site hält, und sagt es, wenn eine Collection kein Site-Modell hat.

## Schreibvorgänge: die eigene API der Site

Die `records`-Routen, `contract`-Operationen und Rückgängig-Belege werden auf Joomla und WordPress vom
Claude-Cowork-Plugin beantwortet; eine EmDash-Site hat keines, daher antworten sie auf EmDash mit
`501 CONTENT_ADAPTER_UNSUPPORTED` (Lesevorgänge, die der Reader nicht bedient) oder `unsupported`.

Um eine EmDash-Site zu ändern, verwende **ihre eigene REST- und MCP-API**, von EmDash auf der Site selbst
unter `/_emdash/api/openapi.json` dokumentiert, mit den Zugangsdaten, die diese Site ausgibt. Der
Tracy-Agent arbeitet dort auf dieselbe Weise: er liest über Tracy und schreibt über EmDashs MCP.

## Was sich von Joomla und WordPress unterscheidet

| | Joomla / WordPress | EmDash |
|---|---|---|
| Lesevorgänge (`content.read`) | Claude-Cowork-Plugin, ab Release 0.18.0 / 0.14.0 | Tracy-Reader, immer |
| `content.locate` (welcher Datensatz ein Element ausgegeben hat) | ja | ja |
| `PATCH` / `DELETE` auf Datensätzen, Contract-Applies, Rückgängigmachen | Plugin | nicht über Tracy — die eigene API der Site |
| Inhaltstypen | die Karte des CMS durch das Plugin | ein Typ pro Collection, aus der `content-api-map.json` des Templates |
| `native` | CMS-Art + ID | die EmDash-Collection und der Eintrag |

## Worauf du achten solltest

- Ein Template, das kein Site-Modell mitliefert, beantwortet ein `describe` mit dem, was der Reader
  ableiten konnte, und sagt das auch; erwarte auf einer solchen Site keine Slots.
- `changedSince` hat dieselbe Grenze von 30 Minuten / 500 Durchläufen wie auf den anderen Plattformen; bei
  `409 CONTENT_SNAPSHOT_EXPIRED` lies `/pages` erneut.
