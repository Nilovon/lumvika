// Disabled: lumvika-engine has no human-in-the-loop approval mechanism.
export async function POST() {
    return Response.json({ error: 'Tool approval is not supported by lumvika-engine yet' }, { status: 501 })
}
