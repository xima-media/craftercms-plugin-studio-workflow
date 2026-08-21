# Verbesserungen

Punkte, die das Plugin für unsere Arbeit besser machen, unabhängig von unserer Umgebung. Hier steht,
was heute umständlich, langsam oder von Hand zu erledigen ist und was das Plugin stattdessen selbst
übernehmen soll. Das schließt Darstellung und Bedienung ebenso ein wie zusätzliche Funktion.

Kein Eintrag hier beschreibt einen Mangel des Plugins. Alles, was hier steht, funktioniert heute
richtig oder ist auf einem anderen Weg zu erreichen, der Weg soll nur kürzer werden. Was objektiv
falsch ist, steht in `BUG.md`, auch dann, wenn es nur die Darstellung betrifft.

## Regeln für Einträge

- Vor jedem neuen Eintrag prüfen, ob der Punkt hier schon steht. Wenn ja, den bestehenden Eintrag
  ergänzen statt einen zweiten anzulegen.
- Kein Eintrag ohne ausdrückliche Zustimmung des Entwicklers.
- Jeder Punkt bekommt eine fortlaufende ID (`IMP-nnn`) und eine Checkbox. Die ID wird nie neu
  vergeben, auch nicht nach dem Abhaken.
- Als Verbesserung formulieren, nicht als Lücke: was ist heute mühsam, was soll das Plugin
  stattdessen tun, wo im Code setzt es an.
- Jeder Eintrag bekommt eine Zeitschätzung. Sie umfasst Analyse, Umsetzung, Review und Test der
  Änderung, auch wenn die Umsetzung mit Claude erfolgt.
- Ist die Machbarkeit noch offen, wird der Eintrag als Prüfung geführt. Die Schätzung nennt dann die
  Prüfung und die Umsetzung getrennt, und die Umsetzung steht unter dem Vorbehalt des Ergebnisses.

## IMP-001

- [ ] Eigene Pakete auf dem Board schneller finden

Das Board zeigt immer alle aktiven Pakete des Workflows. `Board.tsx` hat keine Filterbedienelemente,
die einzigen Eingabefelder sind Titel und Beschreibung im Dialog "New package"
(`Board.tsx:717,726`). Bei mehreren parallelen Redaktionsvorgängen muss jeder die Karten durchsehen,
um seine eigene Arbeit zu erkennen.

Besser sind **zwei unabhängige Umschalter** über dem Board, die sich frei kombinieren lassen. Vier
Zustände sind damit möglich: keiner aktiv zeigt alles, einer aktiv schränkt auf sein Kriterium ein,
beide aktiv schränken auf die Schnittmenge ein.

| Umschalter          | Wirkung                                                                     |
|---------------------|-----------------------------------------------------------------------------|
| Meine Pakete        | nur Pakete, deren Ersteller der angemeldete Benutzer ist                    |
| Meine Zuständigkeit | nur Pakete in Schritten, deren Rollenregel der angemeldete Benutzer erfüllt |

Bewusst zwei Umschalter statt einer dreiwertigen Auswahl, weil beide Kriterien unabhängig sind und
die Kombination gebraucht wird.

Umsetzung setzt an:

- `toPackageSummaryDto` um `createdBy` und den Anzeigenamen erweitern
  (`WorkflowBoardService.groovy:105-119`). Die Spalte wird vom DAO schon gelesen
  (`WorkflowPackageDao.groovy:17`), aber nicht durchgereicht. `created_by` ist nur eine Benutzer-ID,
  für die Anzeige braucht es den Namen, entweder über `fetchAllUsers` wie im Tasks-Panel
  (`TasksPanel.tsx:95-120`) oder direkt aus dem Service.
- Für den Rollenfilter ist alles Nötige schon da: die Board-Antwort liefert `currentUser.groups`
  (`WorkflowBoardService.groovy:46-49`) und die `roleRule` je Schritt (`:96`). Die Auswertung
  übernimmt das bestehende `evaluateRoleRule` (`stepRules.ts:76`), das aktuell nur den Zug in einen
  Schritt prüft.
- Filterung im Client. Die Board-Antwort lädt ohnehin alle aktiven Pakete in einem Aufruf, damit
  wirkt das Umschalten ohne Nachladen. Eine serverseitige Filterung wird erst bei deutlich größeren
  Paketmengen nötig.
- Der gewählte Zustand bleibt über einen Reload erhalten, analog zu `calendarViewPreference.ts`.
- Zu klären ist die Darstellung leerer Spalten: entweder leer anzeigen oder ausblenden. Ich würde
  sie anzeigen, damit die Schrittfolge erkennbar bleibt.

Zeitschätzung 8 bis 12 h: `createdBy` im DTO samt Namensauflösung 2 bis 3 h, Umschalter und
Filterlogik 3 bis 4 h, Sicherung des Zustands über Reloads 1 bis 2 h, Review und Test 2 bis 3 h.

## IMP-002

- [ ] Pakete direkt aus den eigenen bearbeiteten Inhalten schnüren

Ein Paket entsteht heute auf zwei Wegen: manuell auf dem Board über "New package" mit anschließendem
Anhängen von Inhalten, oder automatisch über die Event-Listener der Workflow-Definition, die je
Inhalt ein eigenes Paket erzeugen (`WorkflowPackageService.enrollContentFromListener`). Beides führt
zum Ziel. Ein Redakteur, der über den Tag verteilt an mehreren Seiten und Komponenten gearbeitet hat
und diese gemeinsam einreichen will, muss dabei aber jeden Pfad einzeln suchen und anhängen.

Besser ist ein **Dashlet für das Studio-Dashboard**, das die Inhalte auflistet, an denen der
angemeldete Redakteur gearbeitet hat. Er wählt per Haken mehrere davon aus und erzeugt daraus in
einem Schritt ein neues Paket.

Das Vorbild ist der Dialog zum Anhängen von Inhalten an ein bestehendes Paket. Dessen Feed "My
recent activity" ist genau die gesuchte Liste, und die Mehrfachauswahl mit Haken existiert dort
schon:

- `loadMyRecentActivityFeed` liest über `fetchMyActivity` aus `studio-ui` die eigenen Aktionen
  `CREATE`, `UPDATE` und `MOVE` und entdoppelt sie nach Pfad (`contentAttachFeeds.ts:59-70`).
- `ContentAttachFeedPanel` rendert die Einträge mit Auswahlhaken (`:135-145`).
- `ContentSearchAttachDialog` hält die Mehrfachauswahl und übergibt sie gesammelt (`:52,87-92`).

Zu ergänzen ist:

- Neue Widget-Komponente, registriert in `index.tsx` unter einer eigenen ID, und Einhängen in den
  Dashboard-Abschnitt der `ui.xml` der Site. Ein neuer Erweiterungsmechanismus ist nicht nötig, ein
  Dashlet ist ein Widget wie die bestehenden Panels.
- Auswahl des Ziel-Workflows und des Zielschritts. Sinnvoll ist der erste Schritt des
  Standard-Workflows als Vorbelegung, so wie es `startWorkflowPackageForContent` schon macht
  (`activeWorkflows.ts:62-78`).
- Erzeugen des Pakets mit allen gewählten Pfaden. `workflow-package/create.json` nimmt heute keine
  Inhalte an, `startWorkflowPackageForContent` löst das mit `createPackage` gefolgt von
  `attachContent`. Für mehrere Pfade sind das n+1 Aufrufe. Besser ist ein Endpunkt, der Paket und
  Anhänge in einem Zug anlegt, damit kein halb gefülltes Paket zurückbleibt, wenn ein Anhängen
  fehlschlägt.
- Inhalte ausblenden, die bereits in einem aktiven Paket hängen. `excludeAttachedPaths` gibt es
  schon, die Menge der belegten Pfade käme aus `findPackagesByContentPath` oder einem neuen
  Sammelaufruf.
- Titelvorschlag für das Paket, damit nicht jedes Paket "New Package" heißt.

Zeitschätzung 14 bis 22 h: Dashlet-Komponente samt Wiederverwendung der Feeds 4 bis 6 h, Workflow-
und Schrittauswahl 2 bis 3 h, Endpunkt für Anlegen mit Inhalten 3 bis 5 h, Ausblenden belegter
Inhalte und Titelvorschlag 2 bis 3 h, Verdrahtung in der `ui.xml` und Review und Test 3 bis 5 h.

## IMP-003

- [ ] Zuständige beim Schrittwechsel automatisch benachrichtigen

Wird ein Paket in einen Schritt geschoben, verschickt das Plugin nichts, weder in-app noch per Mail.
`NotificationService.createNotification` wird nur aus `TaskNotificationSupport`, `CommentService` und
`WorkflowBypassService` gerufen, in `WorkflowPackageService` und `WorkflowStepActionService` an keiner
Stelle. Die plugin-eigene Doku sagt das auch so: "Package move and generic comment-added
notifications are **not** yet implemented" (`docs/NOTIFICATIONS.md:50`). Wer ein Paket weitergibt,
sagt dem nächsten Bearbeiter heute selbst Bescheid, etwa per Mail. Das soll das CMS übernehmen.

Besser ist eine **pro Schritt konfigurierbare** Mailbenachrichtigung an die Gruppe, die laut
Rollenregel für diesen Schritt zuständig ist. Bewusst nicht pauschal für alle Schritte, sonst löst
jede Bewegung auf dem Board Mails aus. Beispiel: nur der Schritt "In Prüfung" ist gesetzt, und alle
Reviewer erfahren, dass ein Paket dort liegt.

Drei Bausteine sind zu bauen:

1. **Konfiguration am Schritt.** Die Schrittfelder stehen in der Workflow-Definition, nicht in der
   Datenbank (`CANONICAL_MODEL.md:157-165`). Neben `roleRule`, `actionType` und `allowAddPackage`
   kommt ein Schalter dazu, etwa `notifyRoleOnEnter`. Zu pflegen sind
   `WorkflowDefinitionSupport.toStepDto`, die Validierung im `WorkflowDefinitionService` und die
   Bedienung im Schritt-Dialog (`WorkflowStepRulesDialog.tsx`, `WorkflowEditorDialog.tsx`).
2. **Auflösung Gruppe zu Mitgliedern.** Das gibt es im Plugin nicht. `SiteGroupSupport` kann nur die
   umgekehrte Richtung, nämlich Benutzer zu Gruppen (`getUserGroupNames`), und wird genau dafür
   gebraucht, um die Rollenregel auszuwerten. Für die Empfänger braucht es die Mitglieder einer
   Gruppe, aufgelöst über Studios Gruppen-Service, mit derselben Absicherung über
   `WorkflowBeanLookup`, die `SiteGroupSupport` schon für seine drei Auflösungswege nutzt.
3. **Auslösung und Verteilung.** In `WorkflowPackageService.movePackage` nach dem Schrittwechsel die
   Empfänger bestimmen und je Empfänger `createNotification` rufen. Der Versand selbst ist fertig:
   `NotificationEmailService` prüft die Präferenz des Empfängers und schickt bei `email_enabled` und
   `delivery_mode=immediate` direkt über SMTP. Das Muster für den Fan-out an mehrere Empfänger steht
   in `WorkflowBypassService.notifyStakeholders`.

Zu klären ist:

- Ob der Auslösende ausgeschlossen wird. Der Bypass-Fall macht das so, und für den Reviewer-Fall ist
  es sinnvoll, weil sonst der Einreichende seine eigene Meldung bekommt.
- Wie sich `mode: exclude` in der Rollenregel verhält. "Alle außer Rolle X" ergibt keinen sinnvollen
  Empfängerkreis. Vorschlag: benachrichtigen nur bei `mode: include` mit mindestens einer Rolle, in
  allen anderen Fällen den Schalter im Editor sperren und begründen.
- Verhalten bei Gruppen ohne Mailadressen. `NotificationEmailService` überspringt Empfänger ohne
  gültige Adresse mit einer Warnung und erzeugt die In-App-Meldung trotzdem. Das reicht, muss aber im
  Editor erwähnt sein, damit die Konfiguration nicht als wirkungslos erscheint.

Zeitschätzung 14 bis 22 h: Schrittfeld samt Definition, Validierung und Editor 4 bis 6 h, Auflösung
der Gruppenmitglieder 4 bis 6 h, Auslösung und Fan-out beim Schrittwechsel 3 bis 5 h, Review und Test
mit echtem SMTP 3 bis 5 h.

## IMP-004

- [ ] Unsere Anwendungsfälle über die Oberfläche automatisch absichern

Es gibt zwei Teststufen, aber keine, die einen Anwendungsfall über die Oberfläche prüft:

- Unit-Tests als einzelne `tsx`-Skripte, aufgerufen über `test:unit`. Abgedeckt sind derzeit vier
  Dateien: `attachmentUtils`, `contentEventUtils`, `stepActions` und `workflowFlowEdges`
  (`src/packages/crafterwf-board-components/package.json:21`).
- API-Tests auf Basis von `curl` gegen ein laufendes Studio, mit Endpunktkatalog in
  `scripts/tests/endpoints.manifest.json`.

Ein E2E-Framework ist nicht eingerichtet, weder Playwright noch Cypress ist Abhängigkeit. Abläufe
über mehrere Oberflächen und Rollen werden deshalb von Hand nachgestellt, also genau das, was hier
regelmäßig gebraucht wird: Paket schnüren, in einen Schritt schieben, Rollenregel greift,
Benachrichtigung kommt an.

Besser ist:

- Ein E2E-Aufsatz gegen ein laufendes Studio mit installiertem Plugin. Empfehlung Playwright, weil es
  mehrere Browser-Kontexte parallel führen kann, und mehrere Rollen gleichzeitig sind hier der
  Normalfall (Redakteur und Reviewer im selben Test).
- Anmeldung und Testdaten wiederverwendbar aufgesetzt, damit jedes Szenario mit definiertem Stand
  startet und hinterher aufräumt. Die Token-Behandlung aus `scripts/lib/studio-auth.sh` und die
  Fixtures aus `scripts/tests/lib/fixtures.sh` sind die Vorlage.
- Je Szenario ein Test, benannt nach dem Anwendungsfall.

Offen und beim Entwickler: die Szenarien selbst. Sie werden aus den Anforderungen des Lastenhefts
abgeleitet und liegen vor der Testerstellung vor. Erst danach ist der Umfang dieses Eintrags genau
schätzbar.

Zeitschätzung Grundgerüst 14 bis 20 h: Framework und Konfiguration 4 bis 6 h, Anmeldung und
Rollenwechsel 3 bis 4 h, Testdaten anlegen und aufräumen 4 bis 6 h, erster durchlaufender Test als
Beweis der Tragfähigkeit 3 bis 4 h. Dazu je Szenario 1,5 bis 3 h, abhängig von der Zahl der
beteiligten Rollen und davon, ob eine Mailzustellung geprüft werden muss.

## IMP-005

- [ ] Prüfung: Seite und die dabei erstellten Komponenten in einem Paket zusammenhalten

Wird eine Komponente auf einer Seite erstellt, feuern zwei Lifecycle-Ereignisse, eines für die Seite
und eines für die Komponente. `enrollContentFromListener` behandelt jeden Pfad für sich: es sucht ein
aktives Paket über den Inhaltspfad, sonst über den erzeugten Titel, und legt sonst ein neues an
(`WorkflowPackageService.groovy:377-388`). Ergebnis sind zwei Pakete für einen Redaktionsvorgang, die
getrennt durch den Workflow laufen und getrennt veröffentlicht werden. Zusammenführen lässt sich das
heute nur von Hand über das Board.

Besser wäre, dass beim Weg über die Event-Listener zusammengehörende Inhalte von selbst in einem
Paket landen. Für den Weg über das Dashlet stellt sich die Frage nicht, dort wählt der Redakteur die
Zusammenstellung selbst (`IMP-002`).

Warum die Machbarkeit erst zu prüfen ist:

- Das Ereignis kennt den Zusammenhang nicht. Die Brücke übergibt nur `site`, `path`, `contentType`,
  `contentLifecycleOperation` und `user` (`crafterwf-workflow-lifecycle.groovy`), und der Endpunkt
  `content-event/process.json` reicht genau das weiter. Die zugehörige Seite steht nirgends darin.
- Geteilte Komponenten liegen unter einem eigenen Pfad, im Beispiel
  `/site/components/<uuid>.xml`. Die Zuordnung zur Seite ist nur über Studios Abhängigkeiten
  auflösbar. Das Plugin nutzt heute keinen Abhängigkeits-Service, es gibt keine Stelle, die
  Referenzen oder Elternobjekte ermittelt.
- Die Reihenfolge ist tückisch: die Komponente wird gespeichert, bevor die Seite ihre Referenz
  darauf enthält. Zum Zeitpunkt des Komponenten-Ereignisses ist die Abhängigkeit also womöglich noch
  nicht bekannt. Eine Auflösung über Abhängigkeiten müsste damit umgehen, etwa durch verzögerte
  Zuordnung oder durch Nachziehen beim nächsten Seiten-Ereignis.
- Bei eingebetteten Komponenten liegt der Fall anders, dort steckt der Inhalt in der Seite und es
  entsteht ohnehin nur ein Pfad. Die Prüfung muss beide Formen unterscheiden.
- Zu entscheiden ist außerdem, was bei einer Komponente gilt, die von mehreren Seiten benutzt wird,
  und was passiert, wenn die Seite bereits in einem späteren Schritt liegt.

Zeitschätzung Prüfung 6 bis 10 h: Verhalten der Ereignisse bei geteilten und eingebetteten
Komponenten nachstellen und protokollieren, verfügbare Abhängigkeits-Schnittstellen von Studio
sichten, Ergebnis mit Empfehlung festhalten. Umsetzung bei positivem Ergebnis geschätzt 10 bis 18 h,
unter Vorbehalt des Prüfergebnisses.

## IMP-006

- [ ] Prüfung: Inhalte in einem laufenden Workflow gegen Bearbeitung durch Dritte sperren

Inhalt in einem Paket ist gegen fremde Änderungen nicht geschützt. Der Bypass-Guard greift nur bei
Studios Publish-, Request-Publish- und Reject-Aktionen und nur in der Oberfläche
(`docs/WORKFLOW_BYPASS_GUARD.md:5-14`), nicht beim Speichern von Inhalten. Die plugin-eigene Doku
führt "Content lock / write protection" als nicht vorhanden (`docs/POTENTIAL_REQUIREMENTS.md:38`) und
zählt den Sperrmechanismus zu den größeren offenen Punkten (`:218`). Verlässt man sich heute auf
Absprache, kann jeder mitschreiben, während ein Paket in Prüfung liegt.

Besser wäre, dass eine Seite oder Komponente in einem laufenden Workflow nur noch vom Bearbeiter und
von einer höhergestellten Rolle geändert werden kann.

Warum die Machbarkeit erst zu prüfen ist:

- Studio hat einen eigenen Sperrbegriff. Auf `SandboxItem` gibt es `lockOwner`, und das Plugin liest
  ihn heute nur zur Anzeige (`sandboxItemStateLabel.ts:36`). Ob diese Sperre von außen setzbar und
  über die Dauer eines Workflow-Schritts haltbar ist, oder ob sie an das Öffnen im Formular gebunden
  ist, muss am laufenden System festgestellt werden.
- Eine Sperre nur in der Oberfläche wäre so löchrig wie der Bypass-Guard. Wirksam ist sie erst
  serverseitig, und dort greift das Plugin heute nicht in Schreibvorgänge ein.
- "Höhergestellte Rolle" ist noch nicht definiert. Das Plugin kennt nur Gruppennamen aus
  `SiteGroupSupport` und flache Rollenregeln je Schritt, keine Rangfolge von Rollen. Eine solche
  Ordnung müsste eingeführt oder aus den Studio-Berechtigungen abgeleitet werden.
- Zu klären sind die Randfälle: Freigabe der Sperre bei Rückweisung, beim Archivieren des Pakets und
  beim Zurücksetzen durch einen Administrator, außerdem eine Komponente, die in mehreren Paketen
  hängt, und die Wirkung auf eine Seite, die eine gesperrte Komponente einbindet.

Zeitschätzung Prüfung 6 bis 10 h: Studios Sperr- und Berechtigungsschnittstellen sichten, am
laufenden System nachstellen, ob eine gehaltene Sperre möglich ist, Rollenrangfolge klären, Ergebnis
mit Empfehlung festhalten. Umsetzung bei positivem Ergebnis geschätzt 20 bis 36 h, unter Vorbehalt
des Prüfergebnisses. Die Spanne ist breit, weil der Eingriff bis in Berechtigungen und
Schreibvorgänge von Studio reicht.

## IMP-007

- [ ] Plugin in der Sprache des Benutzers bedienen, vorrangig Deutsch

Das Plugin spricht ausschließlich Englisch. Studio selbst ist übersetzt und bringt Deutsch mit
(`BundledLocaleCodes` in `@craftercms/studio-ui/utils/i18n` kennt `en`, `es`, `de`, `ko`), das
Plugin nutzt davon nichts: `messages.ts` enthält genau einen Eintrag, den Titel für Project Tools,
und `index.tsx` gibt im Descriptor nur `locales: { en: … }` mit. Alle weiteren Texte stehen als
englische Literale direkt in den Komponenten, grob 250 bis 350 Zeichenketten über rund 40
Komponenten. Ein deutschsprachiger Redakteur arbeitet damit in einem deutschen Studio mit einem
englischen Board.

Besser ist eine **durchgängige Übersetzung über den Weg, den Studio dafür vorsieht**, mit Deutsch
als erster zusätzlicher Sprache. Die Sprache wählt der Benutzer in Studio, das Plugin folgt ihr,
ohne eigene Umschaltung.

Betroffen sind vier Schichten, die getrennt zu behandeln sind:

| Schicht                  | Heute                                                                | Weg zur Übersetzung                                                       |
|--------------------------|----------------------------------------------------------------------|---------------------------------------------------------------------------|
| Widgets im Studio        | englische Literale in den Komponenten                                | `defineMessages` plus `useIntl`, Katalog über `locales` im Descriptor      |
| Preview-App (`app.js`)   | eigener React-Root, englische Literale                               | derselbe Katalog, `CrafterCMSNextBridge` liefert den `IntlProvider` schon  |
| Servertexte              | englische Literale in Groovy, teils in der Datenbank gespeichert     | siehe unten, eigene Entscheidung nötig                                    |
| Datums- und Zahlformate  | Formatierung im Client, an Studios Locale nicht gebunden             | `intl.formatDate` bzw. Studios `dateTimeFormatOptions` statt eigener Aufrufe |

Die Frontend-Seite ist Fleißarbeit ohne offene Fragen. Die Werkzeuge liegen bereit und werden nur
nicht benutzt: `react-intl` ist Abhängigkeit, `@formatjs/cli` und `react-intl-translations-manager`
stehen als devDependencies in der `package.json` des Packages. Zu bauen ist ein zentraler
Nachrichtenkatalog je Bereich, ein Extraktionsschritt, der die Ids einsammelt, und die deutschen
Übersetzungen dazu. `augmentTranslations` und `getCurrentLocale` aus `studio-ui/utils/i18n` sind die
Anknüpfungspunkte, falls Texte außerhalb einer Komponente gebraucht werden, etwa in den
Studio-Hooks aus `mountWorkflowStudioHooks`.

Bei den Servertexten ist zu entscheiden, wie weit die Übersetzung reicht:

- Benachrichtigungen werden mit fertigem englischem Titel und Text angelegt und so in der Datenbank
  abgelegt, etwa `'Task assigned to you'` (`TaskNotificationSupport.groovy:14,23,41`) und
  `"Workflow bypass: ${actionLabel}"` (`WorkflowBypassService.groovy:179,284-286`). Übersetzt gehört
  das nicht beim Anlegen, sondern bei der Anzeige, sonst hängt die Sprache am Zufall des
  Erzeugungszeitpunkts. Das heißt: Schlüssel und Parameter speichern statt fertigem Satz, und ein
  Feldpaar in `notification` dafür vorsehen. Bestandsmeldungen bleiben englisch, ein Nachziehen alter
  Zeilen ist nicht sinnvoll.
- Die Mail geht am Client vorbei. `NotificationEmailService` baut Betreff und HTML selbst, inklusive
  `lang="en"`, Schaltfläche "Open in Crafter Studio" und Fußnote (`:280-306`). Die Sprache des
  Empfängers steht in Studio, die Vorlage müsste sie lesen und je Sprache einen Textsatz halten.
- Die Meldungen des Bypass-Guards kommen ebenfalls vom Server
  (`WorkflowBypassService.groovy:21-26`). Sie werden nur angezeigt, nie gespeichert, deshalb genügt
  hier ein Schlüssel in der Antwort und die Formulierung im Client.

Nicht Teil dieses Eintrags sind die Schrittnamen der Workflow-Definitionen. Sie sind Konfiguration
der Site und werden vom Kunden gepflegt, sie kommen in der Sprache, in der sie eingetragen wurden.
Mehrsprachige Definitionen wären ein eigener Punkt.

Zeitschätzung 16 bis 24 h: Katalogstruktur, Extraktion und Verdrahtung im Descriptor 2 bis 3 h,
Umstellung der Widgets auf Nachrichten-Ids 4 bis 6 h, Preview-App 0,5 bis 1 h, deutsche Übersetzung
samt Abstimmung der Fachbegriffe 2 bis 4 h, Datums- und Zahlformate 1 h, Benachrichtigungen auf
Schlüssel und Parameter umstellen 3 bis 4 h, Mailvorlage 1 bis 2 h, Gegenprüfung und Test in beiden
Sprachen 2 bis 3 h. Die Menge der Texte schlägt hier weniger durch als sie es von Hand täte, weil
das Aufspüren der Fundstellen und das Ersetzen mechanisch und maschinell erfolgt. Aufwand entsteht
beim Festlegen der deutschen Begriffe und beim Durchsehen der Oberfläche in beiden Sprachen.
