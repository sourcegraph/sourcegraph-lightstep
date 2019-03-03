import * as sourcegraph from 'sourcegraph'
import { setProjectName } from './project'
import { findSpanReferences } from './spanReferences'

const DECORATION_TYPE = sourcegraph.app.createDecorationType()

export function activate(ctx: sourcegraph.ExtensionContext): void {
    let setNeedsProjectName = false

    ctx.subscriptions.add(sourcegraph.commands.registerCommand('lightstep.setProjectName', setProjectName))

    ctx.subscriptions.add(
        sourcegraph.workspace.onDidOpenTextDocument.subscribe(textDocument => {
            if (sourcegraph.app.activeWindow) {
                decorateEditors(
                    sourcegraph.app.activeWindow.visibleViewComponents.filter(
                        viewComp => viewComp.document.uri === textDocument.uri
                    )
                )
            }
        })
    )

    ctx.subscriptions.add(
        sourcegraph.configuration.subscribe(() => {
            if (sourcegraph.app.activeWindow) {
                decorateEditors(sourcegraph.app.activeWindow.visibleViewComponents)
            }
        })
    )

    function decorateEditors(editorsToUpdate: sourcegraph.CodeEditor[]): void {
        const projectName = sourcegraph.configuration.get().value['lightstep.projectName']
        for (const editor of editorsToUpdate) {
            const spanReferences = findSpanReferences(editor.document.text)
            editor.setDecorations(
                DECORATION_TYPE,
                projectName
                    ? spanReferences.map(({ operationName, line }) => ({
                          range: new sourcegraph.Range(line, 0, line, 0),
                          isWholeLine: true,
                          after: {
                              backgroundColor: 'blue',
                              color: 'rgba(255, 255, 255, 0.8)',
                              contentText: 'Live traces (LightStep) » ',
                              linkURL: buildLiveTracesUrl(projectName, operationName).toString(),
                          },
                      }))
                    : []
            )

            if (!setNeedsProjectName && spanReferences.length > 0) {
                // Update context so that the "Set project name" action appears more prominently in
                // the editor title menu, because the user has viewed a file where the project name
                // is needed.
                sourcegraph.internal.updateContext({ 'lightstep.needsProjectName': true })
                setNeedsProjectName = true
            }
        }
    }
}

function buildLiveTracesUrl(projectName: string, operationName: string): URL {
    const url = new URL(`https://app.lightstep.com/${encodeURIComponent(projectName)}/live`)
    url.searchParams.set('q', `operation:${JSON.stringify(operationName)}`)
    return url
}
