import { Hono } from 'hono'
import { runDataDirChecks } from '../../datadir/checks.js'

export const doctorRoutes = new Hono()

doctorRoutes.get('/', async c => c.json(await runDataDirChecks()))
