import { Hono } from 'hono'
import { toolCatalog } from '../../tools/catalog.js'

export const toolRoutes = new Hono()

toolRoutes.get('/', c => c.json({ families: toolCatalog() }))
