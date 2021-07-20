import expect from 'expect'
import { findSpanReferences } from './spanReferences'

describe('findSpanReferences', () => {
    it('returns empty array for no matches', () => expect(findSpanReferences('a\nb\n')).toEqual([]))

    it('finds matches', () =>
        expect(
            findSpanReferences('startSpan("a") tracePromise("b") traceObservable("c") StartSpanWithContext("d")')
        ).toEqual([
            { operationName: 'a', line: 0 },
            { operationName: 'b', line: 0 },
            { operationName: 'c', line: 0 },
            { operationName: 'd', line: 0 },
        ]))

    it('finds multiple matches', () =>
        expect(
            findSpanReferences(
                'x\n1 startSpan("aa") 2\ny\nstart_span(\'bb\')\nz\n' +
                    'span, _ := opentracing.StartSpanFromContext(ctx, "cc") defer span.Finish()'
            )
        ).toEqual([
            { operationName: 'aa', line: 1 },
            { operationName: 'bb', line: 3 },
            { operationName: 'cc', line: 5 },
        ]))

    it('finds multiple matches per line', () =>
        expect(findSpanReferences('startSpan("a") startSpan("b")')).toEqual([
            { operationName: 'a', line: 0 },
            { operationName: 'b', line: 0 },
        ]))
})
