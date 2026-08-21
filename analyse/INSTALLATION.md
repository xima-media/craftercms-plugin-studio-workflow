# Installation

## Voraussetzungen

- Authoring läuft, MariaDB ist von Studio erreichbar. Das Plugin nutzt Studios JDBC-Pool, es braucht
  keine eigene Verbindung.
- Kein Node, kein Build. Das Bundle liegt gebaut im Repo unter
  `authoring/static-assets/plugins/org/rd/plugin/crafterwf/apps/crafterwf/`.

> **Reihenfolge beachten.** Die Datenbank wird **vor** dem Plugin freigegeben. Andernfalls beginnen
> die Widgets zu pollen, bevor das Plugin migrieren darf. Der erste Aufruf scheitert dann in der
> Schema-Migration und hinterlässt eine verwaiste MariaDB-Sperre, die jede weitere Anfrage 50
> Sekunden blockiert, bis die Verbindung recycelt wird oder Authoring neu startet.

## 1. Datenbank freigeben

Studios Setup gibt seinem Datenbankbenutzer nur Rechte auf das eigene Schema. Der Grant für
`crafter-workflow` fehlt deshalb in jeder frischen Installation. Er ist **einmalig pro
Datenbank** nötig, nicht pro Projekt: Alle Sites einer Studio-Instanz nutzen denselben
Datenbankbenutzer und dasselbe Schema, getrennt wird über die Spalte `site_id`.

Die folgenden Befehle laufen dort, wo die Datenbank erreichbar ist: bei einer Container-Installation
**im Crafter-Container**, bei einer lokalen Installation direkt auf der Maschine. Anzupassen ist nur
`CRAFTER_HOME`, alles Weitere kommt aus `crafter-setenv.sh`, also Client-Pfad, Port, administrativer
Benutzer und dessen Passwort.

```sh
export CRAFTER_HOME=/opt/crafter CRAFTER_BIN_DIR=/opt/crafter/bin
. "$CRAFTER_BIN_DIR"/crafter-setenv.sh >/dev/null 2>&1
```

`CRAFTER_BIN_DIR` muss mitgesetzt werden, weil `crafter-setenv.sh` es selbst nicht setzt, sondern
nur benutzt.

### 1a) Stand prüfen

```sh
MYSQL_PWD="$MARIADB_ROOT_PASSWD" "$MARIADB_HOME"/bin/mariadb \
  -u"$MARIADB_ROOT_USER" -h127.0.0.1 -P"$MARIADB_PORT" --table <<'SQL'
SELECT CONCAT(user,'@',host) AS studio_db_accounts FROM mysql.user WHERE user = 'crafter';
SHOW DATABASES LIKE 'crafter%';
SQL
```

Die erste Tabelle zeigt, für welche Accounts der Grant zu setzen ist, üblicherweise
`crafter@localhost` **und** `crafter@%`. Heißt der Studio-Benutzer nicht `crafter`, steht der
richtige Name in `studio.db.user` (`studio-config.yaml` der Studio-Webapp, überschrieben durch
`data/repos/global/configuration/studio-config-override.yaml`).

### 1b) Grant setzen

Derselbe Aufruf, nur mit anderem SQL. Die `GRANT`-Zeile für jeden Account aus 1a wiederholen:

```sh
MYSQL_PWD="$MARIADB_ROOT_PASSWD" "$MARIADB_HOME"/bin/mariadb \
  -u"$MARIADB_ROOT_USER" -h127.0.0.1 -P"$MARIADB_PORT" <<'SQL'
CREATE DATABASE IF NOT EXISTS `crafter-workflow`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `crafter-workflow`.* TO 'crafter'@'localhost';
GRANT ALL PRIVILEGES ON `crafter-workflow`.* TO 'crafter'@'%';
FLUSH PRIVILEGES;
SQL
```

Läuft MariaDB **außerhalb** von Crafter, verbindet man sich stattdessen mit einem beliebigen
MariaDB-Client gegen Host und Port aus `studio.db.url` und setzt nur das SQL ab.

## 2. Plugin installieren

Welcher Weg in Frage kommt, entscheidet die Herkunft des Plugins.

### a) Aus dem Crafter Marketplace

Liegt das Plugin im Marketplace, installiert es der **Plugin Manager im Studio** direkt von dort:
Projektwerkzeuge (Project Tools), Plugin-Verwaltung (Plugin Management), Plugin installieren
(Install Plugin). Sonst ist nichts vorzubereiten.

**Für dieses Plugin gilt das derzeit nicht.** Es ist nicht im Marketplace veröffentlicht, es liegt
nur lokal vor. Es bleiben die beiden folgenden Wege.

### b) Aus einem lokalen Verzeichnis mit dem Extended Plugin Manager

Setzt voraus, dass im Projekt der Plugin Manager durch den **Extended Plugin Manager** (EPM) ersetzt
wurde. Dann läuft alles im Studio: Projektwerkzeuge, Plugin-Verwaltung, Plugin installieren, **Aus
lokalem Verzeichnis installieren** (Install from Local Directory).

Die Liste zeigt jedes Unterverzeichnis des konfigurierten Ordners, das ein `craftercms-plugin.yaml`
enthält, je Zeile zum Installieren (Install) oder Neuinstallieren (Reinstall). Den Ordner setzt das
Zahnrad, Einstellungen des Extended Plugin Manager, Parameter Lokales Plugin-Verzeichnis
(`localPluginsPath`). Standard ist `/opt/crafter/plugins`, ein relativer Wert löst sich gegen das
Sandbox-Repo der Site auf.

### c) Über die Crafter CLI

Der Standardweg ohne UI, ebenfalls aus einem lokalen Ordner heraus:

```sh
./crafter-cli copy-plugin -e <env> -s <siteId> --path <plugin-pfad>
```

Zu beachten ist, dass die Verbindung zu CrafterCMS über den Befehl `add-environment` eingerichtet 
werden muss, bevor einer der crafter-cli-Befehle verwendet werden kann.
https://craftercms.com/docs/current/reference/modules/crafter-cli.html

## 3. Content-Event-Listener

Legt zwei Groovy-Dateien in die Studio-Webapp, damit Speichervorgänge serverseitig Workflow-Listener
auslösen. `CommonLifecycleApi.groovy` ersetzt dabei eine Datei von Crafter und geht bei einem
Studio-Update verloren.

**Offen:** Eine im Seitenbaum angelegte Seite landet auch ohne diesen Schritt im Workflow, über eine
Frontend-Brücke des Plugins. Welche Speicherwege ohne den Eingriff nicht abgedeckt sind, ist nicht
gemessen.

Die Befehle laufen dort, wo CrafterCMS installiert ist, bei einer Container-Installation also im
Container.

```sh
export CRAFTER_HOME=/opt/crafter
export PLUGIN_PATH=<pfad-zum-plugin-verzeichnis>
STUDIO_WEBAPP="$CRAFTER_HOME"/bin/apache-tomcat/webapps/studio

cp "$PLUGIN_PATH"/authoring/default-site/scripts/libs/CommonLifecycleApi.groovy \
   "$PLUGIN_PATH"/authoring/default-site/scripts/libs/CrafterwfWorkflowLifecycleBridge.groovy \
   "$STUDIO_WEBAPP"/default-site/scripts/libs/

# nur wenn studio.scripting.sandbox.whitelist.enable true ist (Standard: false)
cat "$PLUGIN_PATH"/authoring/default-site/groovy/crafterwf-lifecycle-whitelist.append \
  >> "$STUDIO_WEBAPP"/WEB-INF/classes/crafter/studio/groovy/whitelist
```

Danach Authoring-Tomcat neu starten und die Listener anlegen unter Projektwerkzeuge, Crafter
Workflow, Workflows, Workflow bearbeiten, Content event listeners.