import { pino } from 'pino'
import { env } from '../config/env.js'

export const logger = pino({ level: env().LUMVIKA_LOG_LEVEL })

export type Logger = typeof logger
