import * as sourcegraph from 'sourcegraph'

/**
 * Handle the "LightStep: Set project name" command (show the user a prompt for the project name,
 * and save their input to settings).
 */
export async function setProjectName(): Promise<void> {
    if (!sourcegraph.app.activeWindow) {
        throw new Error('To set the LightStep project name, navigate to a file and then re-run this command.')
    }
    const projectName = await sourcegraph.app.activeWindow.showInputBox({
        prompt: `LightStep project name (example: my-project in https://app.lightstep.com/my-project):`,
        value: sourcegraph.configuration.get().value['lightstep.projectName'] || undefined,
    })
    if (projectName !== undefined) {
        await sourcegraph.configuration.get().update('lightstep.projectName', projectName)
    }
}
