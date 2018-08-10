import { createWebWorkerMessageTransports } from 'cxp/module/jsonrpc2/transports/webWorker'
import { InitializeResult, InitializeParams } from 'cxp/module/protocol'
import {
    TextDocumentDecoration,
    ExecuteCommandParams,
    ConfigurationUpdateRequest,
    MenuItemContribution,
    ConfigurationUpdateParams,
    CommandContribution,
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
import { iconURL } from './icon'
import { Settings, resolveSettings } from './settings'
import { Model } from './model'
import { lightstepToDecorations } from './decoration'
import { hsla, GREEN_HUE, RED_HUE } from './colors'
import { resolveURI, ResolvedURI } from './uri'

const TOGGLE_ALL_DECORATIONS_COMMAND_ID = 'lightstep.decorations.toggleAll'
const TOGGLE_HITS_DECORATIONS_COMMAND_ID = 'lightstep.decorations.hits.toggle'
const VIEW_COVERAGE_DETAILS_COMMAND_ID = 'lightstep.viewCoverageDetails'
const SET_API_TOKEN_COMMAND_ID = 'lightstep.setAPIToken'
const HELP_COMMAND_ID = 'lightstep.help'

export function run(connection: Connection): void {
    let initialized = false
    let root: Pick<ResolvedURI, 'repo' | 'rev'> | null = null
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
        (params: InitializeParams & { originalRootUri?: string }) => {
            if (initialized) {
                throw new Error('already initialized')
            }
            initialized = true

            // Use original root if proxied so we know which repository/revision this is for.
            const rootStr = params.originalRootUri || params.root || undefined
            if (rootStr) {
                root = resolveURI(null, rootStr)
            }

            return {
                capabilities: {
                    textDocumentSync: {
                        openClose: true,
                    },
                    executeCommandProvider: {
                        commands: [
                            TOGGLE_ALL_DECORATIONS_COMMAND_ID,
                            TOGGLE_HITS_DECORATIONS_COMMAND_ID,
                            VIEW_COVERAGE_DETAILS_COMMAND_ID,
                            SET_API_TOKEN_COMMAND_ID,
                            HELP_COMMAND_ID,
                        ],
                    },
                    decorationProvider: { dynamic: true },
                },
            } as InitializeResult
        }
    )

    connection.onDidChangeConfiguration(
        async (params: DidChangeConfigurationParams) => {
            const newSettings: Settings = resolveSettings(
                params.settings.merged
            ) // merged is (global + org + user) settings
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
    textDocuments.onDidClose(async ({ document }) => {
        if (settings) {
            // TODO!(sqs): wait to clear to avoid jitter, but we do need to eventually clear to avoid
            // showing this on non-files (such as dirs), until we get true 'when' support.
            setTimeout(() => {
                if (!lastOpenedTextDocument) {
                    registerContributions(settings!)
                }
            })
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
            case TOGGLE_ALL_DECORATIONS_COMMAND_ID:
            case TOGGLE_HITS_DECORATIONS_COMMAND_ID:
                if (!settings) {
                    throw new Error('settings are not yet available')
                }
                if (!settings['lightstep.decorations']) {
                    settings['lightstep.decorations'] = {}
                }
                switch (params.command) {
                    case TOGGLE_ALL_DECORATIONS_COMMAND_ID:
                        settings['lightstep.decorations'].hide = settings[
                            'lightstep.decorations'
                        ].hide
                            ? undefined
                            : true
                        executeConfigurationCommand(settings, {
                            path: ['lightstep.decorations', 'hide'],
                            value: settings['lightstep.decorations'].hide || null,
                        })
                        break
                    case TOGGLE_HITS_DECORATIONS_COMMAND_ID:
                        settings[
                            'lightstep.decorations'
                        ].lineHitCounts = !settings['lightstep.decorations']
                            .lineHitCounts
                        executeConfigurationCommand(settings, {
                            path: ['lightstep.decorations', 'lineHitCounts'],
                            value:
                                settings['lightstep.decorations'].lineHitCounts ||
                                null,
                        })
                        break
                }
                break

            case VIEW_COVERAGE_DETAILS_COMMAND_ID:
                break

            case SET_API_TOKEN_COMMAND_ID:
                if (!settings) {
                    throw new Error('settings are not available')
                }
                const endpoint = settings['lightstep.endpoints'][0]
                connection.window
                    .showInputRequest(
                        `LightStep API token (for private repositories on ${
                            endpoint.url
                        }):`,
                        endpoint.token
                    )
                    .then(token => {
                        if (token !== null) {
                            return executeConfigurationCommand(settings!, {
                                path: ['lightstep.endpoints', 0, 'token'],
                                value: token || null, // '' will remove, as desired
                            })
                        }
                    })
                    .catch(err =>
                        console.error(`${SET_API_TOKEN_COMMAND_ID}:`, err)
                    )

            case HELP_COMMAND_ID:
                break

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
        if (lastOpenedTextDocument) {
            let ratio: number | undefined
            try {
                ratio = await Model.getFileCoverageRatio(
                    resolveURI(root, lastOpenedTextDocument.uri),
                    settings
                )
            } catch (err) {
                connection.console.error(
                    `Error computing file coverage ratio for ${
                        lastOpenedTextDocument.uri
                    }: ${err}`
                )
            }
            if (ratio !== undefined) {
                contributions.commands!.push({
                    command: TOGGLE_ALL_DECORATIONS_COMMAND_ID,
                    title: `${
                        settings['lightstep.decorations'].hide ? 'Show' : 'Hide'
                    } inline code coverage decorations on file`,
                    category: 'LightStep',
                    toolbarItem: {
                        label: ratio
                            ? `Coverage: ${ratio.toFixed(0)}%`
                            : 'Coverage',
                        description: `LightStep: ${
                            !settings['lightstep.decorations'] ||
                            !settings['lightstep.decorations'].hide
                                ? 'Hide'
                                : 'Show'
                        } code coverage`,
                        iconURL:
                            ratio !== undefined
                                ? iconURL(iconColor(ratio))
                                : undefined,
                        iconDescription:
                            'LightStep logo with red, yellow, or green color indicating the file coverage ratio',
                    },
                })
                const menuItem: MenuItemContribution = {
                    command: TOGGLE_ALL_DECORATIONS_COMMAND_ID,
                }
                contributions.menus!['editor/title']!.push(menuItem)
                contributions.menus!['commandPalette']!.push(menuItem)
            }
        }

        // Always add global commands.
        const globalCommands: {
            command: CommandContribution
            menuItem: MenuItemContribution
        }[] = [
            {
                command: {
                    command: TOGGLE_HITS_DECORATIONS_COMMAND_ID,
                    title: 'Toggle line hit/branch counts',
                    category: 'LightStep',
                },
                menuItem: { command: TOGGLE_HITS_DECORATIONS_COMMAND_ID },
            },
            {
                command: {
                    command: VIEW_COVERAGE_DETAILS_COMMAND_ID,
                    title: 'View coverage details',
                    category: 'LightStep',
                },
                menuItem: { command: VIEW_COVERAGE_DETAILS_COMMAND_ID },
            },
            {
                command: {
                    command: SET_API_TOKEN_COMMAND_ID,
                    title: 'Set API token for private repositories...',
                    category: 'LightStep',
                },
                menuItem: { command: SET_API_TOKEN_COMMAND_ID },
            },
        ]
        for (const { command, menuItem } of globalCommands) {
            contributions.commands!.push(command)
            contributions.menus!['commandPalette']!.push(menuItem)
        }

        contributions.commands!.push({
            command: HELP_COMMAND_ID,
            title: 'Documentation and support',
            category: 'LightStep',
            iconURL: iconURL(),
        })
        contributions.menus!['help']!.push({ command: HELP_COMMAND_ID })

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
        for (const { uri } of documents) {
            connection.sendNotification(
                TextDocumentPublishDecorationsNotification.type,
                {
                    textDocument: { uri },
                    decorations: await getDecorations(root, settings, uri),
                } as TextDocumentPublishDecorationsParams
            )
        }
    }

    async function getDecorations(
        root: Pick<ResolvedURI, 'repo' | 'rev'> | null,
        settings: Settings,
        uri: string
    ): Promise<TextDocumentDecoration[]> {
        const { hide, ...decorationSettings } = settings['lightstep.decorations']
        if (hide) {
            return []
        }
        return lightstepToDecorations(
            decorationSettings,
            await Model.getFileLineCoverage(resolveURI(root, uri), settings)
        )
    }
}

function iconColor(coverageRatio: number): string {
    return hsla(coverageRatio * ((GREEN_HUE - RED_HUE) / 100), 0.25, 1)
}

const connection = createConnection(
    createWebWorkerMessageTransports(self as DedicatedWorkerGlobalScope)
)
run(connection)
connection.listen()
