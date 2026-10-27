---
title: Joomla
description: Was auf einer Joomla-Site antwortet — die Claude-Cowork-Komponente — ihre Mindest-Releases, ihre Datensatzarten und was nur Joomla bietet.
---

## Was den Aufruf beantwortet

Eine Joomla-Site antwortet über die darauf installierte **Claude-Cowork-Komponente** (Paket
`joomla-v…`). Tracy autorisiert deinen Schlüssel und Sitz und reicht die Aktion dann über die eigene Tür
der Site an die Komponente weiter; die Komponente liest und schreibt Joomlas Datenbank über Joomlas eigene
API und antwortet mit dem, was passiert ist. Nichts erreicht die Dateien oder die Datenbank der Site auf
einem anderen Weg.

Die Referenz, gegen die diese Site geschrieben wurde, ist Komponenten-Release **0.18.4**.
`GET /v1/sites/{key}` (das `describe` der Site) meldet das Release, das die Site tatsächlich ausführt.

## Mindest-Releases

Die vollständige Tabelle wird auf der Seite [Kompatibilität](/de/reference/compatibility/) generiert.
Die Releases, von denen die `/v1`-Routen abhängen:

| Route | Aktion | Joomla-Komponente |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.18.0 (`native` 0.18.2, viele IDs in einem Lesevorgang 0.18.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0 (`If-Match` → `expected_content_revisions` 0.18.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

Eine Aktion, die dem installierten Release fehlt, antwortet mit `400 bad_action`. Aktualisiere die
Komponente aus Tracy (der Agent kann über `extension.install` ein neueres Release installieren) oder über
Joomlas eigene Erweiterungsverwaltung.

## Datensatzarten

`{kind}` in den `records`-Routen ist eine der beschreibbaren Arten von Joomla: `article`, `category`,
`tag`, `field`, `menuItem`, `menutype`, `redirect`, `banner`, `bannerClient`, `contact`, `newsfeed`,
`language`, `articleAssociation`, `menuAssociation`, `moduleAssignment`, `languageFilter`, `module`,
`templateStyle`, `user`, `extensionParams`. `content.list` verwendet standardmäßig `article`.

Datensätze werden über ihre numerische `id` adressiert. Felder sind die Spalten der Tabelle: bei einem
Artikel `title`, `introtext`, `fulltext`, `state`, `catid`; bei einem Menüeintrag `title`, `alias`,
`parent_id`. Bei einem bestehenden Menüeintrag, einer Kategorie oder einem Tag verschiebt `parent_id` oder
`move_after` ihn mit allem, was darunter liegt.

## Was nur Joomla bietet

- **Transaktionen.** `content.batch` schreibt bis zu 100 Datensätze in einer Datenbanktransaktion mit
  `expected`-Vorprüfungen — alle landen oder keiner. Es ist eine Aktion der Apply-Tür, (noch) keine
  `/v1`-Route.
- **Contract-Operationen für Mehrsprachigkeit und Demo-Trim.** Jede Operation `multilingual.*`,
  `demoTrim.*`, `siteLanguage.*` und `sourceLanguage.*` von `POST …/contract/{operation}` wird beantwortet,
  wenn der Quickstart der Site dieses Profil mitliefert; WordPress beantwortet nur `multilingual.retire`
  und `multilingual.restore`.
- **Datenbank-Snapshots** (`db.snapshot`, `db.rollback`) und **Core-Upgrades** (`core.upgrade`) existieren
  auf der Apply-Tür für die Werkzeugsätze `site` und `code`; auf `/v1` sind sie nicht verfügbar.

## Worauf du achten solltest

- **Gesperrte Datensätze.** Ein Datensatz, der in Joomlas Editor geöffnet (ausgecheckt) ist, verweigert
  einen Schreibvorgang mit `409 locked` und nennt `lockedBy`. Lass diese Person ihn schließen; es gibt
  keinen Weg, ihn zu überschreiben.
- **Papierkorb, nicht Löschen.** `DELETE …/records/{kind}/{id}` setzt den Papierkorb-Status der Art;
  `revert` stellt ihn wieder her. Arten ohne Papierkorb-Status werden abgelehnt.
- **Contract-Sites.** Eine Site, die aus einem Tracy-Quickstart gebaut wurde, trägt einen Content-Contract.
  Bevorzuge `POST …/contract/apply` für die Slots des Designs: es prüft Grenzen, Belege und Sperren, bevor
  es schreibt, und lehnt ganz oder gar nicht ab.
