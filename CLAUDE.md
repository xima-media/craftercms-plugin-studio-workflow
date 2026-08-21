# Plugin: Crafter Workflow Board

Kanban-Workflow für Studio: Board, Pakete, Kommentare, Aufgaben, Benachrichtigungen, Kalender,
Papierkorb und ein Bypass-Guard, gestützt auf ein eigenes MariaDB-Schema. Der fachliche Stand steht
in `docs/`, allen voran `docs/README.md`, `docs/FUNCTIONAL_SPEC.md` und `docs/API_CONTRACT.md`.

Das Plugin ist ein Fork von `russdanner/plugin-studio-workflow`. Teile werden womöglich upstream
zurückgeführt, deshalb keine strukturellen Umbauten ohne Anlass. Dazu gehört, dass
`scripts/install-plugin.sh` und die Schema-Skripte weiter funktionieren müssen, auch wenn hier ein
anderer Weg gegangen wird.

## Identität

| Wert                       | Wert bzw. Ort                                                     |
|----------------------------|-------------------------------------------------------------------|
| Plugin-ID                  | `org.rd.plugin.crafterwf`, in `craftercms-plugin.yaml`             |
| Bundle-Pfad                | `apps/crafterwf`, Typ `apps`, Name `crafterwf`                     |
| Widget-Bundle              | `index.js`, alle `installation:`-Einträge des Descriptors zeigen darauf |
| Preview-Link-App           | `app.js`, nur über Deep-Links `…&file=app.js#/preview?…` erreichbar, gebaut in `WorkflowPackageService` |

## Wo Dateien hingehören

| Art                                | Pfad                                                                     |
|------------------------------------|--------------------------------------------------------------------------|
| Groovy-Klassen                     | `authoring/scripts/classes/plugins/org/rd/plugin/crafterwf/...`           |
| Groovy-REST-Scripts                | `authoring/scripts/rest/plugins/org/rd/plugin/crafterwf/crafterwf/<bereich>/<name>.<verb>.groovy` |
| SQL-Migrationen                    | als Groovy in `db/SchemaMigrator.groovy`, die Dateien in `authoring/scripts/sql/crafter-workflow/` sind deren Abbild für den Bootstrap per Shell |
| Frontend-Quellen                   | `src/packages/crafterwf-board-components/src/`                             |
| Frontend-Bundle (Build-Output)     | `authoring/static-assets/plugins/org/rd/plugin/crafterwf/apps/crafterwf/`  |

Nur `index.js`, `app.js` und `react-flow.css` liegen im Bundle-Ordner, angelegt vom Build und nicht
von Hand gepflegt. Ein `delivery/`-Tier hat dieses Plugin nicht, es ist rein Authoring.

Studio verarbeitet aus dem Tier nur `content-types/`, `scripts/` und `static-assets/`, und genau die
transportiert `update.sh`. Die übrigen Zweige von `authoring/` sind keine Studio-Konfiguration,
sondern Vorlagen für die Installation, sie bleiben beim Update liegen:

| Zweig                                             | Ziel bei der Installation                                   |
|---------------------------------------------------|-------------------------------------------------------------|
| `authoring/config/studio/workflow/definitions/`   | `<site>/config/studio/workflow/definitions/`, siehe `docs/WORKFLOW_DEFINITIONS.md` |
| `authoring/config/studio/extension/groovy/*.append` | wird an die Groovy-Sandbox-Whitelist der Site angehängt     |
| `authoring/default-site/`                         | Lifecycle-Groovy in Studios eigenes `default-site`, im Container, nicht im Site-Repo |

## Frontend-Build

`src/` ist ein Yarn-3-Workspace mit zwei Packages: `crafterwf-board-components` (das Plugin,
`index.js` plus `react-flow.css`) und `crafterwf-app` (`app.js`). `packages/cra` ist ein
Upstream-Sample für Browser-Entwicklung, absichtlich nicht mehr im `workspaces`-Array.

Node und Yarn laufen nie auf dem Host, sondern im Container aus der `docker-compose.yml`. Dessen
`working_dir` ist `/opt/project`, der Workspace liegt eine Ebene tiefer, und Yarn ist im Image nicht
installiert. Der Aufruf holt sich daher beides selbst: das Arbeitsverzeichnis über `--workdir` und
Yarn aus der im Repo liegenden Release-Datei. `run --rm` startet den Container dafür einmalig und
entsorgt ihn danach, ein laufender Container ist also nicht nötig.

```bash
docker compose run --rm --workdir /opt/project/src webtools node .yarn/releases/yarn-3.2.2.cjs <befehl>
```

| `<befehl>`                                 | Zweck                                                        |
|--------------------------------------------|--------------------------------------------------------------|
| `install`                                  | Abhängigkeiten, einmalig und nach jeder Änderung an `package.json` |
| `dist:deploy`                              | beide Bundles bauen und nach `authoring/static-assets` kopieren |
| `test:unit`                                | Unit-Tests der Board-Komponenten, ohne laufendes Studio       |
| `workspace crafterwf-board-components build` | reiner Typecheck über `tsc`                                 |

`dist:deploy` setzt `PLUGIN_DEPLOY_PATH`, das die Rollup-Configs über `rollup.copy-targets.js` lesen.
Ein relativer Wert wird gegen das jeweilige Package aufgelöst, das Kopierziel hängt also nicht am
Arbeitsverzeichnis. Ohne die Variable bleibt der Build in `dist/` liegen.

## Änderung ins laufende Crafter bringen

```bash
docker compose run --rm --workdir /opt/project/src webtools node .yarn/releases/yarn-3.2.2.cjs dist:deploy
./update.sh
```

Wurde am Frontend nichts geändert, genügt `./update.sh` allein. Es transportiert nur: es kopiert die
von Studio verarbeiteten Ordner des Tiers nach `config/studio` der Site, commitet sie im Site-Repo,
weil Studio sie aus dem letzten Commit liest, und lädt Studios Groovy-Engine neu. Damit sind Groovy-Klassen, REST-Scripts und das Bundle abgedeckt, mehr nicht.

Nicht abgedeckt und jeweils ein eigener Schritt:

- Änderungen am `installation:`-Block des Descriptors. Das Plugin muss dann über den Extended Plugin
  Manager oder die Crafter-CLI neu installiert werden.
- Neue Workflow-Definitionen, Whitelist-Einträge und die Lifecycle-Groovy aus `default-site`. Ziele
  siehe Tabelle oben.
- Das MariaDB-Schema. Installiert wird es aus Studio heraus über Project Tools → Crafter Workflow,
  die Skripte `scripts/grant-workflow-schema.sh`, `scripts/install-workflow-schema.sh` und
  `scripts/drop-workflow-schema.sh` sind der direkte Weg für den Bootstrap-Fall. Sie erwarten eine
  lokale Crafter-Installation über `CRAFTER_AUTHORING` und passen nicht ungeprüft auf diese Umgebung.

`scripts/install-plugin.sh` macht all das in einem Durchlauf, ist aber auf die Installation des
Upstream-Entwicklers zugeschnitten (fester Pfad in `CRAFTER_DATA`, eigenes Token-File) und wird hier
nicht benutzt.

Schlägt das Update fehl oder kommt eine Änderung nicht an, steht die Diagnose in
`knowledge/INSTALLATION.md` der Site.

## Lokale Umgebung und Tokens

CrafterCMS läuft lokal in Docker. Die Zugangsdaten stehen in der `.env` der Site, zwei Ebenen über
diesem Plugin. Sie ist gitignored. `update.sh` liest sie selbst, für eigene Aufrufe einmal in die
Shell holen:

```bash
set -a && . ../../.env && set +a
```

| Variable                 | Wofür                                                        |
|--------------------------|--------------------------------------------------------------|
| `CRAFTER_BASE_URL`       | Basis von Studio und Engine                                  |
| `CRAFTER_SITE_ID`        | Projekt-ID, die site-bezogene Aufrufe als Parameter erwarten  |
| `CRAFTER_API_TOKEN`      | Studio-API, Header `Authorization: Bearer <token>`            |
| `CRAFTER_PREVIEW_TOKEN`  | Engine, gerenderte Seiten, Header `X-Crafter-Preview: <token>` |
| `CRAFTER_CONTAINER_NAME` | Container für `docker logs`                                   |

Die `.env` braucht LF-Zeilenenden. Bei CRLF hängt ein `\r` am Token, der HTTP-Header wird damit
ungültig und Tomcat antwortet mit 400.

Beide Tokens sind Secrets. Sie werden nur aus der Variablen verwendet und nie in eine Datei, eine
Ausgabe oder einen Commit geschrieben.

## Änderung prüfen

Nach `./update.sh` selbst nachsehen, ob die Änderung wirkt.

**Einzelnes REST-Script**, die Antwort ist in `{ "response": …, "result": … }` gewrappt:

```bash
curl -s -H "Authorization: Bearer $CRAFTER_API_TOKEN" \
  "$CRAFTER_BASE_URL/studio/api/2/plugin/script/plugins/org/rd/plugin/crafterwf/crafterwf/admin/schema/status?siteId=$CRAFTER_SITE_ID"
```

**Alle Endpunkte**, über die curl-Suiten in `scripts/tests/`. Sie bringen eigene Variablennamen mit,
die aus der Site-`.env` gefüllt werden:

```bash
STUDIO_URL="$CRAFTER_BASE_URL" SITE_ID="$CRAFTER_SITE_ID" CRAFTER_STUDIO_TOKEN="$CRAFTER_API_TOKEN" \
  WORKFLOW_ID=new-workflow ./scripts/run-api-tests.sh --smoke
```

`WORKFLOW_ID` muss mitgegeben werden, weil der Default `editorial` aus der Upstream-Umgebung stammt.
Welche Definitionen die Site kennt, sagt `admin/workflow/list`. Eine unbekannte ID quittiert das
Plugin mit HTTP 500 und `Workflow definition not found` im Log, nicht mit 404.

Die Suiten sind Shell und curl, sie laufen auf dem Host und nicht im Container. Voraussetzung ist
`jq`, sonst bricht der Runner sofort ab (`sudo apt install jq`). `--smoke` ist lesend, ohne die Option
laufen auch Mutationen samt Fixtures gegen die Site. Welche Suiten und Optionen es gibt, steht in
`scripts/tests/README.md` und in `run-all.sh --help`.

**Fehler und Stacktraces:**

```bash
docker logs --tail 200 "$CRAFTER_CONTAINER_NAME" | grep -i -A 20 "exception"
```

Das Frontend lässt sich so nicht prüfen, es braucht den Browser. Dafür ist der Entwickler zuständig:
er öffnet `$CRAFTER_BASE_URL/studio` im Projekt `$CRAFTER_SITE_ID` und sieht sich das Widget an.
Claude prüft in diesem Fall bis zu Typecheck, Unit-Tests, Build und erfolgreichem Update und meldet,
wo nachzusehen ist.
