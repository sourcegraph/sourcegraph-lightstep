import * as sourcegraph from 'sourcegraph'

export function activate(): void {
    sourcegraph.workspace.onDidOpenTextDocument.subscribe(textDocument => {
        decorateEditors(
            sourcegraph.app.activeWindow!.visibleViewComponents.filter(
                viewComp => viewComp.document.uri === textDocument.uri
            )
        )
    })

    sourcegraph.configuration.subscribe(() => {
        decorateEditors(sourcegraph.app.activeWindow!.visibleViewComponents)
    })

    function decorateEditors(editorsToUpdate: sourcegraph.CodeEditor[]): void {
        const projectName = sourcegraph.configuration.get().value['lightStep.projectName']
        for (const editor of editorsToUpdate) {
            for (const [lineNumber, lineText] of editor.document.text.split('\n').entries()) {
                const match = lineText.match(/start_?span\(['"]([^'"]+)['"]/)
                if (!match) {
                    continue
                }
                const [, operationName] = match
                editor.setDecorations(null, [
                    {
                        range: new sourcegraph.Range(lineNumber, 0, lineNumber, lineText.length - 1),
                        after: {
                            contentText: operationName,
                            linkURL: buildLiveTracesUrl(projectName, operationName).href,
                        },
                    },
                ])
            }
        }
    }
}

function buildLiveTracesUrl(projectName: string, operationName: string): URL {
    const url = new URL(`https://app.lightstep.com/${encodeURIComponent(projectName)}/live`)
    url.searchParams.set('q', `operation:${JSON.stringify(operationName)}`)
    return url
}
