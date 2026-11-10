import { prepareDataDir } from '../../datadir/ladder.js'
import { readDataVersion } from '../../datadir/version.js'
import { dataDir } from '../../config/paths.js'

export async function migrateCommand(): Promise<void> {
    await prepareDataDir()
    process.stdout.write(`Migrated ${dataDir()} to v${readDataVersion()}\n`)
}
