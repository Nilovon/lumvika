import { rerunChatCompletions } from '@rerun/cloud/llm'

// The `rerun` models of the boxes: an OpenAI-compatible endpoint the hub answers for them.
export async function POST(req: Request) {
    return rerunChatCompletions(req)
}
