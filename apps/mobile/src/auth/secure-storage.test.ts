import { deviceKeychain } from '@/auth/secure-storage'

const mockSetItemAsync = jest.fn()
const mockSetItem = jest.fn()
jest.mock('expo-secure-store', () => ({
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
    getItem: jest.fn(),
    getItemAsync: jest.fn(),
    setItem: (...args: unknown[]) => mockSetItem(...args),
    setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}))

describe('deviceKeychain', () => {
    it('keeps the session on this device only, out of every backup', async () => {
        await deviceKeychain.setItemAsync('lumvika_cookie', '{}')
        deviceKeychain.setItem('lumvika_session_data', '{}')
        expect(mockSetItemAsync).toHaveBeenCalledWith('lumvika_cookie', '{}', { keychainAccessible: 'after-first-unlock-this-device-only' })
        expect(mockSetItem).toHaveBeenCalledWith('lumvika_session_data', '{}', { keychainAccessible: 'after-first-unlock-this-device-only' })
    })
})
