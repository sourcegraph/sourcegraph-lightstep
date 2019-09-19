/**
 * A reference to an OpenTracing span in a document.
 *
 * @see https://opentracing.io/docs/overview/spans/
 */
export interface SpanReference {
    /**
     * The operation name of the span.
     */
    operationName: string

    /**
     * The 0-indexed line number where the reference occurs.
     */
    line: number
}

const START_SPAN_PATTERN = /(?:start_?span|(?:trace(?:promise|observable|span)))\w*\((?:ctx,\s*)?['"]([^'"]+)['"]/gi

/**
 * Finds references to OpenTracing spans in the document, using heuristics to match function calls
 * that indicate the start of a span.
 *
 * @param text The document text.
 * @returns An array of references to spans in the document.
 */
export function findSpanReferences(text: string): SpanReference[] {
    const refs: SpanReference[] = []
    for (const [i, line] of text.split('\n').entries()) {
        let m: RegExpExecArray | null
        do {
            m = START_SPAN_PATTERN.exec(line)
            if (m) {
                refs.push({
                    operationName: m[1],
                    line: i,
                })
            }
        } while (m)
        START_SPAN_PATTERN.lastIndex = 0 // reset
    }
    return refs
}
