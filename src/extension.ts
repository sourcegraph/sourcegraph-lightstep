import * as sourcegraph from 'sourcegraph'
import { findSpanReferences } from './spanReferences'

const DECORATION_TYPE = sourcegraph.app.createDecorationType()

export function activate(ctx: sourcegraph.ExtensionContext): void {
    ctx.subscriptions.add(
        sourcegraph.workspace.onDidOpenTextDocument.subscribe(textDocument => {
            decorateEditors(
                sourcegraph.app.activeWindow!.visibleViewComponents.filter(
                    viewComp => viewComp.document.uri === textDocument.uri
                )
            )
        })
    )

    ctx.subscriptions.add(
        sourcegraph.configuration.subscribe(() => {
            decorateEditors(sourcegraph.app.activeWindow!.visibleViewComponents)
        })
    )

    function decorateEditors(editorsToUpdate: sourcegraph.CodeEditor[]): void {
        const projectName = sourcegraph.configuration.get().value['lightstep.projectName']
        for (const editor of editorsToUpdate) {
            editor.setDecorations(
                DECORATION_TYPE,
                findSpanReferences(editor.document.text).map(({ operationName, line }) => ({
                    range: new sourcegraph.Range(line, 0, line, 0),
                    isWholeLine: true,
                    after: {
                        backgroundColor: 'blue',
                        color: 'rgba(255, 255, 255, 0.8)',
                        contentText: 'Live traces (LightStep) » ',
                        linkURL: buildLiveTracesUrl(projectName, operationName).toString(),
                    },
                }))
            )
        }
    }
}

function buildLiveTracesUrl(projectName: string, operationName: string): URL {
    const url = new URL(`https://app.lightstep.com/${encodeURIComponent(projectName)}/live`)
    url.searchParams.set('q', `operation:${JSON.stringify(operationName)}`)
    return url
}
