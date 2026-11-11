import { is, type InferInsertModel, type InferSelectModel } from 'drizzle-orm'
import { isPgEnum, PgTable, type PgEnum as PgEnumType, type PgTable as PgTableType } from 'drizzle-orm/pg-core'

import * as publicSchema from './schema/public'
import type { Json } from './schema/columns'

type PublicExports = typeof publicSchema

export type PublicTables = { [K in keyof PublicExports as PublicExports[K] extends PgTableType ? K : never]: PublicExports[K] }
export type TableName = keyof PublicTables & string
export type TableRow<T extends TableName> = InferSelectModel<PublicTables[T]>
export type TableInsert<T extends TableName> = InferInsertModel<PublicTables[T]>
export type TableUpdate<T extends TableName> = Partial<TableInsert<T>>

type PublicEnums = { [K in keyof PublicExports as PublicExports[K] extends { enumName: string; enumValues: readonly string[] } ? K : never]: PublicExports[K] }
export type EnumName = keyof PublicEnums & string
export type EnumValue<E extends EnumName> = PublicEnums[E] extends { enumValues: readonly (infer V)[] } ? V : never

export const publicTables = Object.fromEntries(Object.entries(publicSchema).filter(([, value]) => is(value, PgTable))) as unknown as PublicTables

export const publicEnums = Object.fromEntries(Object.entries(publicSchema).filter(([, value]) => isPgEnum(value))) as unknown as PublicEnums

export function tableOf<T extends TableName>(name: T): PublicTables[T] {
    const table = publicTables[name]
    if (!table) throw new Error(`Unknown table: ${name}`)
    return table
}

// The shape the app was written against, derived from the drizzle schema, so `Database['public']['Tables']['agents']['Row']` and `Tables<'agents'>` still read.
export type Database = {
    public: {
        Tables: { [T in TableName]: { Row: TableRow<T>; Insert: TableInsert<T>; Update: TableUpdate<T> } }
        Enums: { [E in EnumName]: EnumValue<E> }
    }
}

export type Tables<T extends TableName> = TableRow<T>
export type TablesInsert<T extends TableName> = TableInsert<T>
export type TablesUpdate<T extends TableName> = TableUpdate<T>
export type Enums<E extends EnumName> = EnumValue<E>
export type { Json }
