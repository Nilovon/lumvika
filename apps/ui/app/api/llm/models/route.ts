import { lumvikaModels } from '@lumvika/cloud/llm'

// What each `lumvika` alias runs, for the boxes that show it.
export async function GET(req: Request) {
    return lumvikaModels(req)
}
