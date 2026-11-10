import { type TemplateDocument, templateDocumentSchema } from '@lumvika/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Resolver } from 'react-hook-form'

// The form is the document, unflattened: react-hook-form addresses nested paths natively,
// so `agents.0.skills.1.name` is a field name and the values it holds are already what the
// write path expects.
export const adminTemplateSchema = templateDocumentSchema
export type TemplateFormValues = TemplateDocument

// The schema's `.default()` calls make its INPUT type (fields optional) differ from its
// OUTPUT type (fields present), and react-hook-form types the resolver against the input.
// The form only ever holds output-shaped values though: it is seeded from rowToDocument,
// which parses, and every mutation goes through the parsed shape. Asserting that once here
// keeps `string | undefined` from leaking into every field component.
export const templateFormResolver = zodResolver(adminTemplateSchema) as unknown as Resolver<TemplateFormValues, unknown, TemplateFormValues>
