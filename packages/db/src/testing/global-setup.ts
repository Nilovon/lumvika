import { resetTestDatabase } from './database'

export default async function setup() {
    await resetTestDatabase()
}
