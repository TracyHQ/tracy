---
title: WordPress
description: Was auf einer WordPress-Site antwortet — das Claude-Cowork-Plugin — seine Mindest-Releases, seine Datensatzarten und -Schlüssel und was sich von Joomla unterscheidet.
---

## Was den Aufruf beantwortet

Eine WordPress-Site antwortet über das darauf installierte **Claude-Cowork-Plugin** (Paket
`wordpress-v…`). Tracy autorisiert deinen Schlüssel und Sitz und reicht die Aktion dann über die eigene Tür
der Site an das Plugin weiter; das Plugin liest und schreibt über WordPress' eigene Funktionen und antwortet
mit dem, was passiert ist.

Die Referenz, gegen die diese Site geschrieben wurde, ist Plugin-Release **0.14.3**. `GET /v1/sites/{key}`
(das `describe` der Site) meldet das Release, das die Site tatsächlich ausführt.

## Mindest-Releases

Die vollständige Tabelle wird auf der Seite [Kompatibilität](/de/reference/compatibility/) generiert.
Die Releases, von denen die `/v1`-Routen abhängen:

| Route | Aktion | WordPress-Plugin |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.14.0 (`native` 0.14.2, viele IDs in einem Lesevorgang 0.14.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0 (`If-Match` → `expected_content_revisions` 0.14.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

Eine Aktion, die dem installierten Release fehlt, antwortet mit `400 bad_action`. Aktualisiere das Plugin
aus Tracy (der Agent kann über `plugin.install` ein neueres Release installieren) oder über die
Plugin-Seite der Site.

## Datensatzarten und -Schlüssel

`{kind}` ist eine von `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.

- **`post`** umfasst jeden Beitragstyp — Seiten, Beiträge, eigene Typen. `GET …/records/post` listet nur
  Beiträge auf; grenze mit `?post_type=` ein oder finde einen Slug mit `?name=`. Andere Arten werden
  einzeln gelesen.
- **Schlüssel neben IDs.** Eine `option` (ihr Name) und ein `templatePart` (sein Slug: `header`,
  `footer`) haben keine numerische ID: nimm `0` als `{id}` und benenne den Datensatz über seinen
  Schlüssel. Ein `postmeta`-Eintrag nimmt die Beitrags-ID als `{id}` und den Meta-Schlüssel als
  Schlüssel; ein `term` nimmt die Term-ID als `{id}` und die Taxonomie als Schlüssel; ein
  `menuItem` nimmt seine eigene ID als `{id}` und sein Menü (Slug oder Name) als Schlüssel. `GET` und
  `DELETE` nehmen den Schlüssel als `?key=` in der Query (`GET …/records/option/0?key=blogname`);
  `PATCH` nimmt ihn als `"key"` im Body.
- **Was gelöscht werden kann.** `DELETE` akzeptiert `post`, `templatePart` und `menuItem`. Lösche
  ein `menuItem` mit seinem Menü als `?key=`: ohne ihn gelingt das Löschen trotzdem, aber `revert`
  kann den Eintrag nicht zurückschreiben. Eine `option` und ein `postmeta`-Eintrag können nicht
  gelöscht werden: schreibe stattdessen einen leeren Wert. Auch ein `term` kann nicht gelöscht
  werden: `PATCH` bearbeitet ihn oder legt mit `0` als `{id}` und einem `name` einen neuen an
  (Felder: `name`, `slug`, `description`, `parent`).
- Felder sind die von WordPress selbst: bei einem Beitrag `post_title`, `post_content`, `post_status`,
  `post_name`; bei einer Option `value`.

## Was sich von Joomla unterscheidet

- **Keine Transaktion.** WordPress hat kein `content.batch`: mehrere Schreibvorgänge sind mehrere Anfragen,
  jede unter derselben `apply_id` protokolliert, wenn du ein einziges Rückgängigmachen willst. Schlägt eine
  fehl, bleiben die früheren geschrieben, bis du den Beleg zurücknimmst.
- **Contract-Operationen.** `POST …/contract/{operation}` beantwortet `inspect`, `bind`, `apply`,
  `demoTrim.*` (`plan`, `apply`, `revert`), `siteLanguage.*` und `sourceLanguage.*`; aus der Familie für Mehrsprachigkeit nur `multilingual.retire`
  und `multilingual.restore`. `inspect`/`bind` nehmen `contract`, das Profil, gegen das geprüft wird.
- **Übersetzungen.** Sprachen werden vom Übersetzungs-Plugin der Site (Polylang) über die Apply-Tür-Aktion
  `content.language` (Plugin 0.9.0) gehandhabt, Core-Übersetzungen über `language.install` (0.11.0). Keine
  von beiden ist heute eine `/v1`-Route.
- **Themes.** `theme.style` wendet eine Stilvariante des aktiven Block-Themes an (0.8.1); Themes und Plugins
  werden von einer Paket-URL installiert. Diese brauchen den Werkzeugsatz `code` und sind Aktionen der
  Apply-Tür.
- **Fatale Fehler.** Ein fataler PHP-Fehler innerhalb des Plugins antwortet mit `500 fatal` samt Datei und
  Zeile; der Aufruf kann teilweise gelaufen sein — lies die Site, bevor du es erneut versuchst.

## Worauf du achten solltest

- **Gesperrte Datensätze.** Ein Beitrag, der im Block-Editor geöffnet ist, verweigert einen Schreibvorgang
  mit `409 locked` und nennt `lockedBy`.
- **Papierkorb nur für Beiträge.** `DELETE` auf einen `post` verwendet WordPress' eigenen Papierkorb.
  Ein `templatePart` oder ein `menuItem` wird endgültig gelöscht; `revert` schreibt ihn aus der mit
  dem Apply gespeicherten Kopie zurück.
- **`itemsCursor`** bei `GET …/contents/{id}` wird auf WordPress erkannt, aber noch nicht bedient
  (`501 CONTENT_ADAPTER_UNSUPPORTED`); blättere Blöcke stattdessen mit `blocksCursor`.
