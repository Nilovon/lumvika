import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../cn'
import { richTextClassName } from '../rich-text-editor/rich-text-styles'

const components: Components = {
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
        </a>
    ),
}

export function Markdown({ content, className }: { content: string; className?: string }) {
    return (
        <div className={cn(richTextClassName, className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </div>
    )
}
