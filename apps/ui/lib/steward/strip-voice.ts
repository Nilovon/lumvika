import type { UIMessage } from 'ai'

import { appendAttachmentsRef, buildAttachmentsRef, parseAttachments } from '@/lib/chat/attachments-marker'
import { parseVoiceMessage } from '@/lib/voice/marker'

// Le marqueur <voice> est ce qui redessine la bulle lecteur au rechargement, il reste donc dans la
// conversation persistée. Le modèle, lui, n'a besoin que du transcript : le marqueur nomme un .webm
// sous chat-uploads/ qu'il n'a aucun moyen d'écouter, et le voir l'a déjà fait partir chercher ce
// fichier au lieu de répondre au transcript posé juste au-dessus. La copie remise au modèle ici est
// ramenée au seul transcript, comme ce qu'un agent de Box reçoit.
export function withoutVoiceMarkers(messages: UIMessage[]): UIMessage[] {
    let stripped = false

    const next = messages.map(message => {
        if (message.role !== 'user') return message

        const last = message.parts.findLastIndex(part => part.type === 'text')
        if (last < 0) return message

        // Un vocal envoyé avec des fichiers porte le marqueur des pièces jointes après le sien : lui
        // reste, le modèle doit toujours savoir où lire ces fichiers.
        const text = (message.parts[last] as { text: string }).text
        const attachments = parseAttachments(text)
        const voice = parseVoiceMessage(attachments?.text ?? text)
        // Une dictée dont le transcript est revenu vide n'est jamais envoyée, et un part de texte
        // vide est ce que certains fournisseurs refusent : le message est laissé tel quel.
        if (!voice?.transcript) return message

        stripped = true
        const modelText = attachments ? appendAttachmentsRef(voice.transcript, buildAttachmentsRef(attachments.paths)) : voice.transcript
        const parts = message.parts.map((part, index) => (index === last ? { ...part, text: modelText } : part))
        return { ...message, parts }
    })

    return stripped ? (next as UIMessage[]) : messages
}
