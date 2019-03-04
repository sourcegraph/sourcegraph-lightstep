# LightStep for Sourcegraph

A [Sourcegraph extension](https://docs.sourcegraph.com/extensions) that lets you view live traces on [LightStep](https://lightstep.com) for [OpenTracing](https://opentracing.io) spans in your code.

[**🗃️ Source code**](https://github.com/sourcegraph/sourcegraph-lightstep)

[**➕ Add to Sourcegraph**](https://sourcegraph.com/extensions/sourcegraph/lightstep) (see [usage instructions](#usage) for self-hosted Sourcegraph instances)

## Features

Works on [Sourcegraph.com](https://sourcegraph.com) and [self-hosted Sourcegraph instances](https://docs.sourcegraph.com/#quickstart).

- **Live traces on LightStep** link decoration on lines containing OpenTracing start span calls

![Screenshot](https://storage.googleapis.com/sourcegraph-assets/LightStep_Sourcegraph.png)

## Usage

1. Enable the `sourcegraph/lightstep` extension:
   - On Sourcegraph.com, visit [https://sourcegraph.com/extensions/sourcegraph/lightstep](https://sourcegraph.com/extensions/sourcegraph/lightstep) to enable it.
   - On a self-hosted Sourcegraph instance, select **User menu > Extensions**, search for `sourcegraph/lightstep`, and enable it.
1. Visit any code file containing an OpenTracing start span call.
1. Click on the **Live traces (LightStep)** link that appears at the end of the line of each OpenTracing start span call to open the LightStep live traces page for that operation.

## Roadmap

- Add at-a-glance summary about a span in a hover message.
- Display all spans in the current file, tree, and repository.
- Support usage in the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension).
- Link to LightStep queries for tags and other properties of a span.
- Show all recent tag values for a span (for all tags, and for each tag defined in a call).
- Show spans that contain a given span.
