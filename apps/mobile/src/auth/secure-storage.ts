import * as SecureStore from 'expo-secure-store'

// The session stays on this phone: never in an iCloud backup, never restored onto another device.
const KEYCHAIN: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }

export const deviceKeychain = {
    getItem: (key: string) => SecureStore.getItem(key, KEYCHAIN),
    getItemAsync: (key: string) => SecureStore.getItemAsync(key, KEYCHAIN),
    setItem: (key: string, value: string) => SecureStore.setItem(key, value, KEYCHAIN),
    setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value, KEYCHAIN),
}
