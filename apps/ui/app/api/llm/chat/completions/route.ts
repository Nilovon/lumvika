import { lumvikaChatCompletions } from '@lumvika/cloud/llm'

// The `lumvika` models of the boxes: an OpenAI-compatible endpoint the hub answers for them.
export async function POST(req: Request) {
    return lumvikaChatCompletions(req)
}
