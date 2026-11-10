import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'

// The alias lands on Lumvika Cloud's side exactly when the private folder is in the checkout.
it('resolves @lumvika/cloud to cloud/ when it is there, to cloud-oss/ otherwise', () => {
    expect(LUMVIKA_CLOUD).toBe(existsSync(path.resolve(import.meta.dirname, '../../../cloud/packages/cloud/src')))
})
