import { act, renderHook } from '@testing-library/react-native'

import { useIntake } from './useIntake'

describe('useIntake', () => {
    it('guesses the industry from the site and hands the site over', async () => {
        const decideIndustry = jest.fn(async () => 'saas' as const)
        const submit = jest.fn(async () => {})
        const { result } = await renderHook(() => useIntake({ knownFirstName: null, decideIndustry, submit }))

        await act(async () => result.current.set({ companyUrl: 'rerun.build' }))
        await act(async () => result.current.next())
        expect(decideIndustry).toHaveBeenCalledWith('rerun.build')
        await act(async () => {})
        expect(result.current.step).toBe('role')

        await act(async () => result.current.choose({ position: 'Founder / CEO' }))
        await act(async () => result.current.set({ firstName: 'Clement' }))
        await act(async () => result.current.next())
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ companyUrl: 'rerun.build', position: 'Founder / CEO', firstName: 'Clement', decidedIndustry: 'saas' }))
    })
})
