import { createWebWorkerMessageTransports } from 'cxp/module/jsonrpc2/transports/webWorker'
import { InitializeResult } from 'cxp/module/protocol'
import {
    TextDocumentDecoration,
    ExecuteCommandParams,
    ConfigurationUpdateRequest,
    MenuItemContribution,
    ConfigurationUpdateParams,
    Contributions,
    DidChangeConfigurationParams,
    RegistrationRequest,
    RegistrationParams,
    TextDocumentPublishDecorationsNotification,
    TextDocumentPublishDecorationsParams,
} from 'cxp/lib'
import { Connection, createConnection } from 'cxp/module/server/server'
import { TextDocuments } from 'cxp/module/server/features/textDocumentSync'
import { isEqual } from 'cxp/module/util'
import { TextDocument } from 'vscode-languageserver-types/lib/umd/main'
import { LIGHTSTEP_ICON_URL } from './icon'

/**
 * The settings for this extension. See the configuration JSON Schema in extension.json for the canonical
 * documentation for these properties.
 */
export interface Settings {
    ['lightstep.decorations']?: boolean
    ['lightstep.project']?: string
}

/** The regexp that matches "start span" calls. */
const START_SPAN_PATTERN = /start_?span[^"']+["']([^"']+)["']/gi

const TOGGLE_DECORATIONS_COMMAND_ID = 'lightstep.decorations.toggle'
const SET_PROJECT_NAME_COMMAND_ID = 'lightstep.setProjectName'
const LIGHTSTEP_BRAND_COLOR = '#2d36fb'

export function run(connection: Connection): void {
    let settings: Settings | undefined
    let lastOpenedTextDocument: TextDocument | undefined

    // Track the currently open document.
    const textDocuments = new TextDocuments()
    textDocuments.listen(connection)
    textDocuments.onDidOpen(
        ({ document }) => (lastOpenedTextDocument = document)
    )
    textDocuments.onDidClose(({ document }) => {
        if (
            lastOpenedTextDocument &&
            lastOpenedTextDocument.uri === document.uri
        ) {
            lastOpenedTextDocument = undefined
        }
    })

    connection.onInitialize(
        () => {
            return {
                capabilities: {
                    textDocumentSync: {
                        openClose: true,
                    },
                    executeCommandProvider: {
                        commands: [
                            TOGGLE_DECORATIONS_COMMAND_ID,
                            SET_PROJECT_NAME_COMMAND_ID,
                        ],
                    },
                    decorationProvider: { dynamic: true },
                },
            } as InitializeResult
        }
    )

    connection.onDidChangeConfiguration(
        async (params: DidChangeConfigurationParams) => {
            const newSettings: Settings = params.settings.merged
            if (isEqual(settings, newSettings)) {
                return // nothing to do
            }
            settings = newSettings
            // Don't bother updating client view state if there is no document yet.
            if (lastOpenedTextDocument) {
                await registerContributions(newSettings)
                await publishDecorations(newSettings, textDocuments.all())
            }
        }
    )

    textDocuments.onDidOpen(async ({ document }) => {
        if (settings) {
            await registerContributions(settings)
            await publishDecorations(settings, [document])
        }
    })
    textDocuments.onDidClose(async () => {
        if (settings) {
            registerContributions(settings)
        }
    })

    connection.onExecuteCommand((params: ExecuteCommandParams) => {
        const executeConfigurationCommand = (
            newSettings: Settings,
            configParams: ConfigurationUpdateParams
        ) => {
            // Run async to avoid blocking our response (and leading to a deadlock).
            connection
                .sendRequest(ConfigurationUpdateRequest.type, configParams)
                .catch(err => console.error('configuration/update:', err))
            registerContributions(newSettings).catch(err =>
                console.error('registerContributions:', err)
            )
            publishDecorations(newSettings, textDocuments.all()).catch(err =>
                console.error('publishDecorations:', err)
            )
        }

        switch (params.command) {
            case TOGGLE_DECORATIONS_COMMAND_ID:
                if (!settings) {
                    throw new Error('settings are not yet available')
                }
                settings['lightstep.decorations'] = !(
                    settings['lightstep.decorations'] !== false
                )
                executeConfigurationCommand(settings, {
                    path: ['lightstep.decorations'],
                    value: settings['lightstep.decorations'],
                })
                break

            case SET_PROJECT_NAME_COMMAND_ID:
                if (!settings) {
                    throw new Error('settings are not available')
                }
                connection.window
                    .showInputRequest(
                        'LightStep project name:',
                        settings['lightstep.project']
                    )
                    .then(projectName => {
                        if (projectName !== null) {
                            return executeConfigurationCommand(settings!, {
                                path: ['lightstep.project'],
                                value: projectName || null, // '' will remove, as desired
                            })
                        }
                    })
                    .catch(err =>
                        console.error(`${SET_PROJECT_NAME_COMMAND_ID}:`, err)
                    )

            default:
                throw new Error(`unknown command: ${params.command}`)
        }
    })

    let registeredContributions = false
    async function registerContributions(settings: Settings): Promise<void> {
        const contributions: Contributions = {
            commands: [],
            menus: { 'editor/title': [], commandPalette: [], help: [] },
        }

        // Trace links toggle.
        if (lastOpenedTextDocument && settings['lightstep.project']) {
            contributions.commands!.push({
                command: TOGGLE_DECORATIONS_COMMAND_ID,
                title: `${
                    settings['lightstep.decorations'] === false
                        ? 'Show'
                        : 'Hide'
                } inline trace links`,
                category: 'LightStep',
                toolbarItem: {
                    label: '',
                    description: `LightStep: ${
                        settings['lightstep.decorations'] === false
                            ? 'Show'
                            : 'Hide'
                    } trace links`,
                    iconURL: LIGHTSTEP_ICON_URL,
                    iconDescription: 'LightStep logo',
                },
            })
            const menuItem: MenuItemContribution = {
                command: TOGGLE_DECORATIONS_COMMAND_ID,
            }
            if (START_SPAN_PATTERN.test(lastOpenedTextDocument.getText())) {
                contributions.menus!['editor/title']!.push(menuItem)
            }
            contributions.menus!['commandPalette']!.push(menuItem)
        }

        // Project name prompt.
        contributions.commands!.push({
            command: SET_PROJECT_NAME_COMMAND_ID,
            title: settings['lightstep.project']
                ? `Switch project (${settings['lightstep.project']})`
                : 'Set project name',
            category: 'LightStep',
            toolbarItem: {
                label: 'Configure LightStep',
                description:
                    'Set LightStep project name to show trace links...',
                iconURL: LIGHTSTEP_ICON_URL,
                iconDescription: 'LightStep logo',
            },
        })
        const projectNameMenuItem: MenuItemContribution = {
            command: SET_PROJECT_NAME_COMMAND_ID,
        }
        contributions.menus!['commandPalette']!.push(projectNameMenuItem)
        if (
            lastOpenedTextDocument &&
            START_SPAN_PATTERN.test(lastOpenedTextDocument.getText()) &&
            !settings['lightstep.project']
        ) {
            contributions.menus!['editor/title']!.push(projectNameMenuItem)
        }

        await connection.sendRequest(RegistrationRequest.type, {
            registrations: [
                {
                    id: 'main',
                    method: 'window/contribution',
                    overwriteExisting: registeredContributions,
                    registerOptions: contributions,
                },
            ],
        } as RegistrationParams)
        registeredContributions = true
    }

    async function publishDecorations(
        settings: Settings,
        documents: TextDocument[]
    ): Promise<void> {
        for (const doc of documents) {
            connection.sendNotification(
                TextDocumentPublishDecorationsNotification.type,
                {
                    textDocument: { uri: doc.uri },
                    decorations: await getDecorations(doc, settings),
                } as TextDocumentPublishDecorationsParams
            )
        }
    }

    function getDecorations(
        doc: TextDocument,
        settings: Settings
    ): TextDocumentDecoration[] {
        const projectName = settings['lightstep.project']
        if (settings['lightstep.decorations'] === false || !projectName) {
            return []
        }
        const decorations: TextDocumentDecoration[] = []
        for (const [i, line] of doc
            .getText()
            .split('\n')
            .entries()) {
            let m: RegExpExecArray | null
            do {
                m = START_SPAN_PATTERN.exec(line)
                if (m) {
                    decorations.push({
                        range: {
                            start: { line: i, character: 0 },
                            end: { line: i, character: 0 },
                        },
                        after: {
                            backgroundColor: LIGHTSTEP_BRAND_COLOR,
                            color: 'rgba(255, 255, 255, 0.8)',
                            contentText: 'Live traces (LightStep) » ',
                            linkURL: liveTracesURL(projectName, m[1]),
                        },
                    })
                }
            } while (m)
            START_SPAN_PATTERN.lastIndex = 0 // reset
        }
        return decorations
    }
}

export function liveTracesURL(projectName: string, spanName: string): string {
    return `https://app.lightstep.com/${encodeURIComponent(
        projectName
    )}/live?q=${encodeURIComponent(`operation:${JSON.stringify(spanName)}`)}`
}

const connection = createConnection(
    createWebWorkerMessageTransports(self as DedicatedWorkerGlobalScope)
)
run(connection)
connection.listen()
