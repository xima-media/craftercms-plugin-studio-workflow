# Bekannte Fehler

Gefundene Fehler des Plugins, unabhängig von unserer Umgebung. Ein Fehler ist alles, was objektiv
falsch ist, auch wenn es nur die Darstellung betrifft. Unstimmige Abstände, abgeschnittene Felder
und unsichtbare Bedienelemente stehen deshalb hier und nicht in `IMPROVEMENT.md`. Dort steht, was
richtig funktioniert, aber besser werden soll.

## Regeln für Einträge

- Vor jedem neuen Eintrag prüfen, ob der Fehler hier schon steht. Wenn ja, den bestehenden Eintrag
  ergänzen statt einen zweiten anzulegen.
- Kein Eintrag ohne ausdrückliche Zustimmung des Entwicklers.
- Jeder Fehler bekommt eine fortlaufende ID (`BUG-nnn`) und eine Checkbox. Die ID wird nie neu
  vergeben, auch nicht nach dem Abhaken.
- So knapp wie möglich formulieren, aber nachvollziehbar: was passiert, was erwartet wird, wo es im
  Code sitzt.
- Jeder Eintrag bekommt eine Zeitschätzung. Sie umfasst Analyse, Umsetzung, Review und Test der
  Änderung, auch wenn die Umsetzung mit Claude erfolgt.

## BUG-001

- [ ] Admin-Tab der Projektwerkzeuge ist bei installiertem Schema nicht erreichbar

`GeneralTab` meldet `onSchemaReady()` bei **jedem** Mount, sobald die Statusabfrage `installed`
liefert (`GeneralTab.tsx:32`). `ProjectToolsConfiguration` schaltet in diesem Callback auf den Tab
`workflows` (`ProjectToolsConfiguration.tsx:73`). Beim Klick auf Admin springt die Ansicht deshalb
sofort zurück.

Der Callback ist als "Schema wurde gerade installiert, jetzt weiterschalten" gedacht und darf nur
nach einer erfolgreichen Installation feuern, nicht beim Anzeigen eines bereits installierten
Schemas.

Folge: Die Statuszeile "Workflow Database: Installed" ist nie sichtbar, und alles Weitere im
Admin-Tab bleibt unerreichbar.

Zeitschätzung 1 bis 2 h: Umstellung des Callbacks auf den Installationsabschluss 0,5 bis 1 h, Review
und Test 0,5 bis 1 h.

## BUG-002

- [ ] Frontendbrücke meldet jede Änderung als `edit` und erzeugt neben der Groovy-Brücke doppelte
      Pakete

Die Frontendbrücke kann kein `create` senden. Studios `ContentEvent.getEventType()` liefert konstant
`"CONTENT_EVENT"`, `resolveBridgeEventType` (`contentEventUtils.ts:4-16`) bildet das auf `edit` ab.
Solange `editListeners` leer ist, fällt `resolveListeners`
(`WorkflowContentEventService.groovy:101-112`) auf die `createListeners` zurück und es fällt nicht
auf. Sind `editListeners` definiert, trifft neu angelegter Content nur noch die Edit-Regeln und
bekommt "Geändert:" statt "Neu:".

Erwartet: neuer Content trifft die Create-Regeln, geänderter die Edit-Regeln.

Sind Groovy- und Frontendbrücke gleichzeitig aktiv, laufen für einen Speichervorgang zwei Aufrufe mit
widersprüchlicher Klassifizierung, `create` vom Server und `edit` vom Browser.
`enrollContentFromListener` (`WorkflowPackageService.groovy:367-401`) prüft per
`findActiveByWorkflowAndContentPath`, legt bei Fehltreffer an und hängt den Content erst danach an,
ohne Lock oder Transaktion. Der einzige Unique-Key ist
`uk_content_ref (workflow_package_id, content_path)` (`SchemaMigrator.groovy:357`), nicht
`(workflow_id, content_path)`. Fällt der Browser-Aufruf in dieses Fenster, entstehen zwei Pakete.
Gemessen in derselben Installation: bei 10 ms Abstand doppelt, bei 103 ms nicht. Wer den Fehler nicht
mehr sieht, hat das Rennen gewonnen. Bei unterschiedlichen `stepId` bestimmt zusätzlich der letzte
Aufruf den Step (`:395-399`).

Die Groovy-Brücke ist getestet und deckt `NEW`, `UPDATE` und `COPY` ab.

Vor einer Änderung ist zu klären, ob die Frontendbrücke überhaupt noch gebraucht wird. Sie läuft nur
unter `/studio/preview*` (`WorkflowContentEventBridge.tsx:15-17`), also nicht in Dashboard, Suche und
Projektwerkzeugen. Die Doku begründet sie damit, dass Speichern aus Preview und Experience Builder
keine Lifecycle-Controller auslöst (`docs/WORKFLOW_DEFINITIONS.md:93`), das Log gibt allerdings
Hinweise darauf, dass auch Änderungen per Experience Builder im Lifecycle landen. Nur wenn sicher
ist, dass sie nicht gebraucht wird, wird sie zurückgebaut,
sinnvollerweise hinter einem Schalter, denn abschaltbar ist sie derzeit nicht
(`mountWorkflowStudioHooks()` steht unkonditioniert in `index.tsx`). Andernfalls muss sie gegen
Doppelanlage abgesichert werden.

Zeitschätzung 8 bis 17 h: Analyse und Entscheidung 3 bis 5 h, Rückbau hinter Schalter 2 bis 3 h oder
Absicherung gegen Doppelanlage 5 bis 8 h, Review und Test 3 bis 4 h. Der Test ist der unsichere
Posten, weil das Rennen nur durch Wiederholung oder künstliche Verzögerung zuverlässig sichtbar wird.

## BUG-003

- [ ] Board background lässt sich nur einmal setzen, danach werden Änderungen verworfen

Das Feld läuft unter zwei Namen durch die API. `toWorkflowDto`
(`WorkflowDefinitionSupport.groovy:35-36`) liefert `backgroundUrl` und `backgroundColor` mit
demselben Wert. Der Editor sendet `{ ...detail.workflow, backgroundColor: boardBackground }`
(`WorkflowEditorDialog.tsx:358-362`), der Spread trägt also den alten `backgroundUrl` mit.
Serverseitig gewinnt genau dieser: `backgroundUrl ?: backgroundColor`
(`WorkflowDefinitionService.groovy:215-216`).

Folge: Beim neu angelegten Workflow ist `backgroundUrl` null (`:127`), die erste Auswahl greift.
Jede weitere Änderung wird ignoriert, der Hintergrund bleibt auf dem ersten Wert stehen.

Erwartet: Die im Editor gewählte Farbe wird bei jedem Speichern übernommen.

Der Lesepfad ist in Ordnung (`workflowApi.ts:156-167`, `Board.tsx:429-441`), der Fehler sitzt allein
im Schreibpfad. Sauber wäre, das Feld auf einen Namen zu vereinheitlichen, statt nur die Priorität
serverseitig umzudrehen.

Zeitschätzung 2 bis 4 h: Vereinheitlichung des Feldnamens über API, Client und Migration bestehender
Definitionen 1 bis 2 h, Review und Test 1 bis 2 h.

## BUG-004

- [ ] Panels für Comments, Notifications und Tasks werden nach einem Reload nicht gefunden

Die Panel-Descriptoren tragen kein Plugin-Binding. `createCrafterwfPluginBinding`
(`pluginWidgets.ts:26-33`) holt `createFileBuilder` aus `window.craftercms.utils.state`. Dort liegt
es nicht: `craftercms.utils.state` ist `utils/state.ts` von Studio, `createFileBuilder` steht in
`services/plugin.ts` und ist als `craftercms.services.plugin.createFileBuilder` verfügbar. Die
Funktion liefert deshalb immer `undefined`, und `createCrafterwfWidgetDescriptor` (`:35-45`) erzeugt
einen Descriptor ohne `plugin`.

Solange das Plugin-Bundle bereits geladen ist, fällt das nicht auf. Studios `Widget` findet die
Komponente dann in der Registry und braucht das Binding nicht (`Widget.tsx:57-70`). Beim Klick auf
das Toolbar-Icon ist das immer der Fall, denn der Button stammt selbst aus dem Bundle.

Beim Reload dreht sich die Reihenfolge um. Studio speichert die offene ICE-Panel-Seite in
`localStorage` (`epics/preview.ts:194-205`) und stellt sie beim Start wieder her
(`ICEToolsPanel.tsx:55-60`, `reducers/preview.ts:705-740`). Der wiederhergestellte Descriptor wird
gerendert, bevor der Toolbar-Button das Bundle nachgeladen hat. Ohne `plugin` rendert `Widget`
sofort den EmptyState "Component ... not found" (`Widget.tsx:70-77`) und lädt nichts nach. Die
Registry ist kein reaktiver Store, das spätere Registrieren löst kein Re-Render aus, deshalb bleibt
die Meldung bis zur nächsten Interaktion stehen. Der zweite Klick baut die Seite neu auf, jetzt ist
das Bundle registriert und das Panel erscheint.

Erwartet: Das nach dem Reload wiederhergestellte Panel rendert ohne weiteren Klick.

Betroffen sind alle drei Panels, sie öffnen über denselben Weg
(`ContentCommentsToolbarButton.tsx:91-93`, `NotificationsToolbarButton.tsx:49`,
`TasksToolbarButton.tsx:52` über `buildOpenIcePanelAction`, `studioPreview.ts:10-28`).

Zeitschätzung 1 bis 2 h: Zugriff auf `craftercms.services.plugin.createFileBuilder` umstellen und
gegen fehlende API absichern 0,5 h, Review und Test über Reload in allen drei Panels 0,5 bis 1,5 h.

## BUG-005

- [ ] Toolbar-Buttons stapeln ICE-Panel-Seiten, Zurück läuft die Klickhistorie ab

Die Buttons für Comments, Notifications und Tasks öffnen ihr Panel über
`buildOpenIcePanelAction` (`studioPreview.ts:10-28`) und dispatchen dabei jedes Mal
`PUSH_ICE_PANEL_PAGE` (`ContentCommentsToolbarButton.tsx:91-93`,
`NotificationsToolbarButton.tsx:49`, `TasksToolbarButton.tsx:52`).

Studio hängt diese Seite bedingungslos an den Stack (`reducers/preview.ts`, Case
`pushIcePanelPage`: `icePanelStack: [...state.icePanelStack, payload]`) und rendert nur das oberste
Element (`ICEToolsPanel.tsx`: `icePanelStack.slice(icePanelStack.length - 1)`). Der Zurück-Pfeil ist
`ToolsPanelPage.onBack` und dispatcht genau ein `POP_ICE_PANEL_PAGE`, der Reducer macht `stack.pop()`.

Jeder Klick ist damit eine weitere Verschachtelung, auch wenn dasselbe Panel schon offen ist. Der
Wechsel von einem Panel zum nächsten sieht wie ein Wechsel aus, ist aber ein Drilldown. Zurück
arbeitet die gesamte Klickhistorie ab, bevor der Stack leer ist und die konfigurierten Widgets des
ICE-Panels wieder erscheinen.

Erwartet: Ein Toolbar-Button ist Navigation auf der ersten Ebene, kein Drilldown. Das Panel ersetzt
das aktuell offene, und ein Zurück führt direkt auf das Standard-ICE-Panel.

Behebung: Vor dem Push die aktuelle Länge von `preview.icePanelStack` lesen und entsprechend viele
`popIcePanelPage()` in dieselbe `BATCH_ACTIONS` voranstellen, danach genau einen Push. Liegt das
gewünschte Panel schon oben, nichts dispatchen außer `EDIT_MODE_CHANGED`, sonst baut sich das Panel
bei jedem Klick neu auf und verliert seinen internen State. `buildOpenIcePanelAction` ist kein Hook
und hat keinen Store-Zugriff, die Stack-Länge kommt daher entweder per Selector-Hook aus dem Aufrufer
(analog zu `usePreviewContentPath`) oder über `window.craftercms.getStoreSync()`.

Das Verhalten verstärkt BUG-004: Studio persistiert nur die oberste Seite, der restliche Stack ist
nach einem Reload ohnehin verloren.

Zeitschätzung 1 bis 2 h: Umbau von `buildOpenIcePanelAction` samt Guard 0,5 h, Review und Test über
alle drei Panels inklusive Wechsel und Zurück 0,5 bis 1,5 h.

## BUG-006

- [ ] Datumsfelder im Tasks-Panel schneiden die Uhrzeit ab

"Start date & time" und "Due date & time" stehen im Formular "Add task" nebeneinander in einer Zeile
(`TasksPanel.tsx:455-474`, `Stack direction="row"` mit zwei `fullWidth`-Feldern). Jedes Feld bekommt
damit knapp die halbe Panelbreite. Das ICE-Panel ist schmal, ein `datetime-local`-Feld braucht Datum
und Uhrzeit nebeneinander, deshalb wird die Uhrzeit abgeschnitten und ist nicht mehr lesbar.

Erwartet: beide Felder untereinander, also `direction="column"` mit demselben Abstand wie die
übrigen Formularzeilen. Die volle Panelbreite reicht für Datum und Uhrzeit, und die Reihenfolge
Start vor Due bleibt erhalten.

Zeitschätzung 0,5 bis 1 h: Umstellung des Stacks und Sichtprüfung bei minimaler und vergrößerter
Panelbreite.

## BUG-007

- [ ] Abstände in den Panels sind nicht einheitlich

Die Panels setzen ihre Abstände jeweils für sich, ohne gemeinsame Regel. Der Rahmen ist zwar
überall `px: 1, pb: 2` (`ContentCommentsPanel.tsx:206`, `NotificationsPanel.tsx:166`,
`TasksPanel.tsx:342`), die Kinder addieren aber unterschiedlich viel dazu: Überschriften und
Textzeilen `px: 0.5`, einzelne Zeilen `px: 0.25` (`TasksPanel.tsx:529`), Buttons `px: 0`. Innere
Boxen laufen mit `p: 1`, `p: 1.25` und `p: 2` auseinander (`NotificationsPanel.tsx:173,280`,
`ContentCommentsPanel.tsx:177,195`), und die Zustandsflächen für "kein Content" und "Fehler" stehen
mit `p: 2` weiter innen als die Liste, die sie ersetzen. Ein Abstand nach oben fehlt in allen drei
Panels, der Inhalt beginnt direkt unter dem Panel-Header.

Erwartet: ein gemeinsamer Satz Abstände für alle Panels, sodass linke Kante, Abstand zum Header und
Abstände der Blöcke zueinander über die Panels hinweg gleich sind.

Sinnvoll ist, den Rahmen an einer Stelle zu definieren, etwa als gemeinsames Panel-Layout oder als
Konstanten neben `toolbarBadge.tsx`, und die Einzelwerte in den Panels darauf zurückzuführen, statt
sie je Komponente nachzujustieren.

Zeitschätzung 3 bis 6 h: Festlegen des Rasters 0,5 bis 1 h, Umbau der drei Panels und der
gemeinsamen Abschnitte 1,5 bis 3 h, Review und Sichtprüfung 1 bis 2 h.

## BUG-008

- [ ] Inhalt der Box "Content event listeners" klebt am Rahmen

`AccordionDetails` wird mit `px: 0` gerendert (`WorkflowEditorDialog.tsx:740`), der umgebende
`Accordion` hat aber einen sichtbaren Rahmen (`:734`). Dadurch laufen Beschreibungstext, Tabs und die
Listener-Zeilen bündig gegen den Rahmen, während die Überschrift im `AccordionSummary` das
MUI-Standard-Padding behält. Die Einrückung springt also innerhalb derselben Box.

Erwartet: Inhalt und Überschrift stehen auf derselben Kante, mit Abstand zum Rahmen.

Zeitschätzung 0,5 bis 1 h: `px: 0` entfernen oder durch ein passendes Padding ersetzen und die
Section im Dialog gegenprüfen.

## BUG-009

- [ ] Kein Cursor im Kommentar-Eingabefeld sichtbar

Das Eingabefeld ist eine transparente `textarea` über einer Spiegel-Box, die den Text mit
hervorgehobenen Mentions rendert (`CommentMentionInput.tsx:160-250`). Der Text der `textarea` ist
deshalb `color: 'transparent'`, sichtbar bleiben soll nur der Cursor über
`caretColor: 'text.primary'` (`:246-247`).

`caretColor` ist keine der Properties, die MUI in `sx` gegen die Theme-Palette auflöst. Der Wert
geht unverändert als `caret-color: text.primary` ins CSS, ist damit ungültig und wird verworfen. Der
Browser fällt auf `auto` zurück und leitet die Cursorfarbe aus `color` ab, also aus `transparent`.

Erwartet: sichtbarer Cursor in Textfarbe.

Zu setzen ist ein aufgelöster Wert, etwa `caretColor: (theme) => theme.palette.text.primary`.

Zeitschätzung 0,5 h: Änderung und Sichtprüfung in hellem und dunklem Theme.

