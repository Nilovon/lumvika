import { rerunModels } from '@rerun/cloud/llm'

// What each `rerun` alias runs, for the boxes that show it.
export async function GET(req: Request) {
    return rerunModels(req)
}
