# LightStep CXP extension (WIP)

See [LightStep](https://lightstep.io) trace links in your code, on GitHub and any other platform that supports the [Code Extension Protocol (CXP)](https://github.com/sourcegraph/cxp-js).

![](screenshot.png)

**NOTE:** This repository's history will be rewritten before being published.

## EXPERIMENTAL: Usage instructions (currently only for Sourcegraphers)

1.  Clone this repository and run `npm install && npm run serve`.
1.  In your Sourcegraph dev instance, create an extension and add the following to the manifest (change the port number if `npm run serve` reported a different port):
    ```json
    {
        ...,
        "platform": {"type": "bundle", "url": "http://localhost:1234/cx-lightstep.js"},
        ...
    }
    ```
1.  Enable the extension and visit a file such as http://localhost:3080/github.com/sourcegraph/go-langserver@bf90fac03a4d1a07f50701547d56fabfdb0c32ec/-/blob/langserver/loader.go#L29:30 or http://localhost:3080/github.com/sourcegraph/javascript-typescript-langserver@50df3752f631abca884e2a41426c1f70afa07ca8/-/blob/src/connection.ts#L236:29 that has LightStep "start span" calls. You should see a link after each such line.
