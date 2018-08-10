import * as assert from 'assert'
import { liveTracesURL } from './extension'

describe('liveTracesURL', () => {
    it('produces the URL to live traces for a span and project', () =>
        assert.strictEqual(
            liveTracesURL('p', 's'),
            'https://app.lightstep.com/p/live?q=operation%3As'
        ))
})
