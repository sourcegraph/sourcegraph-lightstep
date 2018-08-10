import * as assert from 'assert'
import { resolveSettings, DecorationSettings } from './settings'

describe('Settings', () => {
    describe('decorations', () => {
        it('applies defaults when not set', () =>
            assert.deepStrictEqual(resolveSettings({})['lightstep.decorations'], {
                lineBackgroundColors: true,
            } as DecorationSettings))

        it('respects the hide property', () =>
            assert.deepStrictEqual(
                resolveSettings({
                    'lightstep.decorations': {
                        hide: true,
                        lineBackgroundColors: true,
                        lineHitCounts: true,
                    },
                })['lightstep.decorations'],
                {
                    hide: true,
                } as DecorationSettings
            ))

        it('respects the other properties', () =>
            assert.deepStrictEqual(
                resolveSettings({
                    'lightstep.decorations': {
                        lineBackgroundColors: false,
                        lineHitCounts: true,
                    },
                })['lightstep.decorations'],
                {
                    lineBackgroundColors: false,
                    lineHitCounts: true,
                } as DecorationSettings
            ))

        it('applies defaults for the other properties', () =>
            assert.deepStrictEqual(
                resolveSettings({
                    'lightstep.decorations': {},
                })['lightstep.decorations'],
                {
                    lineBackgroundColors: true,
                    lineHitCounts: false,
                } as DecorationSettings
            ))
    })
})
