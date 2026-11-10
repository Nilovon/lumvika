import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

import { RERUN_CLOUD } from '@rerun/cloud/edition'

// The alias lands on Rerun Cloud's side exactly when the private folder is in the checkout.
it('resolves @rerun/cloud to cloud/ when it is there, to cloud-oss/ otherwise', () => {
    expect(RERUN_CLOUD).toBe(existsSync(path.resolve(import.meta.dirname, '../../../cloud/packages/cloud/src')))
})
