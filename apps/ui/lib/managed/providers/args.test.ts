import { describe, expect, it } from 'vitest'
import { bool, num, obj, objList, requireStr, str, strList } from './args'

describe('provider args', () => {
    const args = { s: 'x', empty: '', n: 0, b: false, list: ['a', 1, 'b'], o: { k: 1 }, arr: [1], objs: [{ a: 1 }, null, [1], 'x', { b: 2 }] }

    it('reads each value only when it has the asked type', () => {
        expect(str(args, 's')).toBe('x')
        expect(str(args, 'n')).toBeUndefined()
        expect(num(args, 'n')).toBe(0)
        expect(num(args, 's')).toBeUndefined()
        expect(bool(args, 'b')).toBe(false)
        expect(bool(args, 'n')).toBeUndefined()
    })

    it('refuses an empty required string', () => {
        expect(requireStr(args, 's')).toBe('x')
        expect(() => requireStr(args, 'empty')).toThrow('Missing required argument: empty')
        expect(() => requireStr(args, 'missing')).toThrow('Missing required argument: missing')
    })

    it('filters the lists and tells a missing list from an empty one', () => {
        expect(strList(args, 'list')).toEqual(['a', 'b'])
        expect(strList(args, 's')).toBeUndefined()
        expect(objList(args, 'objs')).toEqual([{ a: 1 }, { b: 2 }])
        expect(objList(args, 'o')).toBeUndefined()
    })

    it('does not take an array for an object', () => {
        expect(obj(args, 'o')).toEqual({ k: 1 })
        expect(obj(args, 'arr')).toBeUndefined()
        expect(obj(args, 'missing')).toBeUndefined()
    })
})
