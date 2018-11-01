import * as sourcegraph from 'sourcegraph'

const START_SPAN_PATTERN = /start_?span\(['"]([^'"]+)['"]/gi

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
            const decorations: sourcegraph.TextDocumentDecoration[] = []
            for (const [i, line] of editor.document.text.split('\n').entries()) {
                let m: RegExpExecArray | null
                do {
                    m = START_SPAN_PATTERN.exec(line)
                    if (m) {
                        decorations.push({
                            range: new sourcegraph.Range(i, 0, i, 0),
                            isWholeLine: true,
                            after: {
                                backgroundColor: 'blue',
                                color: 'rgba(255, 255, 255, 0.8)',
                                contentText: 'Live traces (LightStep) » ',
                                linkURL: buildLiveTracesUrl(projectName, m[1]).toString(),
                            },
                        })
                    }
                } while (m)
                START_SPAN_PATTERN.lastIndex = 0 // reset
            }

            editor.setDecorations(null, decorations)
        }
    }
}

function buildLiveTracesUrl(projectName: string, operationName: string): URL {
    const url = new URL(`https://app.lightstep.com/${encodeURIComponent(projectName)}/live`)
    url.searchParams.set('q', `operation:${JSON.stringify(operationName)}`)
    return url
}
