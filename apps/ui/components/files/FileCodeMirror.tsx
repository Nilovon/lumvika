'use client'

import type { LanguageSupport } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'

import { loadLanguage } from './code-mirror-language'
import { codeMirrorTheme } from './code-mirror-theme'

export type FileCodeMirrorProps = {
    value: string
    onChange: (value: string) => void
    fileName: string
    readOnly?: boolean
    autoFocus?: boolean
    onSave?: () => void
}

const BASIC_SETUP = {
    lineNumbers: true,
    foldGutter: false,
    autocompletion: false,
    highlightActiveLine: true,
    highlightActiveLineGutter: true,
    bracketMatching: true,
    closeBrackets: true,
    searchKeymap: true,
    lintKeymap: false,
} as const

export default function FileCodeMirror({ value, onChange, fileName, readOnly = false, autoFocus = false, onSave }: FileCodeMirrorProps) {
    const { resolvedTheme } = useTheme()
    const [language, setLanguage] = useState<LanguageSupport | null>(null)

    useEffect(() => {
        let cancelled = false
        void loadLanguage(fileName).then(support => {
            if (!cancelled) setLanguage(support)
        })
        return () => {
            cancelled = true
        }
    }, [fileName])

    const extensions = useMemo<Extension[]>(() => {
        const list: Extension[] = [EditorView.lineWrapping]
        if (language) list.push(language)
        if (onSave) {
            list.push(
                keymap.of([
                    {
                        key: 'Mod-s',
                        preventDefault: true,
                        run: () => {
                            onSave()
                            return true
                        },
                    },
                ]),
            )
        }
        return list
    }, [language, onSave])

    return (
        <CodeMirror
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            autoFocus={autoFocus}
            height="100%"
            className="h-full text-xs [&_.cm-editor]:h-full"
            basicSetup={BASIC_SETUP}
            theme={codeMirrorTheme(resolvedTheme === 'dark')}
            extensions={extensions}
        />
    )
}
