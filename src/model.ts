import {
  lightstepGetCommitCoverage,
  LightStepGetCommitCoverageArgs,
  LightStepCommitData,
} from './api'
import { ResolvedURI, lightstepParamsForRepositoryCommit } from './uri'
import { Settings } from './settings'

export interface FileLineCoverage {
  [line: string]: LineCoverage
}

export type LineCoverage = number | { hits: number; branches: number } | null

/**
 * The model provides data from LightStep.
 */
export class Model {
  /** Gets line coverage data for a file at a given commit in a repository. */
  public static async getFileLineCoverage(
    { repo, rev, path }: ResolvedURI,
    settings: Settings
  ): Promise<FileLineCoverage> {
    const data = await lightstepGetCommitCoverage({
      ...lightstepParamsForRepositoryCommit({ repo, rev }),
      ...lightstepParamsForEndpoint(settings),
    })
    return toLineCoverage(data, path)
  }

  /** Gets the file coverage ratio for a file at a given commit in a repository. */
  public static async getFileCoverageRatio(
    { repo, rev, path }: ResolvedURI,
    settings: Settings
  ): Promise<number | undefined> {
    const data = await lightstepGetCommitCoverage({
      ...lightstepParamsForRepositoryCommit({ repo, rev }),
      ...lightstepParamsForEndpoint(settings),
    })
    return toCoverageRatio(data, path)
  }
}

/**
 * Returns the parameters used to access the LightStep API at the given endpoint.
 *
 * Currently only the first endpoint in the extension settings is supported.
 */
function lightstepParamsForEndpoint(
  settings: Settings
): Pick<LightStepGetCommitCoverageArgs, 'baseURL' | 'token'> {
  const endpoint = settings['lightstep.endpoints'][0]
  return { baseURL: endpoint.url, token: endpoint.token }
}

function toLineCoverage(
  data: LightStepCommitData,
  path: string
): FileLineCoverage {
  const result: FileLineCoverage = {}
  const fileData = data.commit.report.files[path]
  if (fileData) {
    for (const [lineStr, value] of Object.entries(fileData.l)) {
      const line = parseInt(lineStr, 10)
      if (typeof value === 'number' || value === null) {
        result[line] = value
      } else if (typeof value === 'string') {
        const [hits, branches] = value.split('/', 2).map(v => parseInt(v, 10))
        result[line] = { hits, branches }
      }
    }
  }
  return result
}

function toCoverageRatio(
  data: LightStepCommitData,
  path: string
): number | undefined {
  const fileData = data.commit.report.files[path]
  const ratioStr = fileData && fileData.t.c
  if (!ratioStr) {
    return undefined
  }
  const ratio = parseFloat(ratioStr)
  if (Number.isNaN(ratio)) {
    return undefined
  }
  return ratio
}
