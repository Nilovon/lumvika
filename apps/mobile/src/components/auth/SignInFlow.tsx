import { createContext, useContext, useState, type ReactNode } from 'react'

export type SignInStep = { name: 'start' } | { name: 'email' } | { name: 'server' } | { name: 'code'; method: 'email' }

type SignInFlow = {
    email: string
    setEmail: (email: string) => void
    step: SignInStep
    // Which way the last move went, so a step slides in from the side it comes from.
    direction: 'forward' | 'back'
    goTo: (step: SignInStep) => void
    back: () => void
    // Something is on its way to the hub: the Steward thinks while it is.
    thinking: boolean
    setThinking: (thinking: boolean) => void
}

const SignInFlowContext = createContext<SignInFlow | null>(null)

// What the sign-in steps share: the code step reads the address the email step typed.
export function SignInFlowProvider({ initialStep = { name: 'start' }, children }: { initialStep?: SignInStep; children: ReactNode }) {
    const [email, setEmail] = useState('')
    const [history, setHistory] = useState<SignInStep[]>(() => (initialStep.name === 'start' ? [initialStep] : [{ name: 'start' }, initialStep]))
    const [direction, setDirection] = useState<'forward' | 'back'>('forward')
    const [thinking, setThinking] = useState(false)

    const goTo = (step: SignInStep) => {
        setDirection('forward')
        setHistory(previous => [...previous, step])
    }
    const back = () => {
        setDirection('back')
        setHistory(previous => (previous.length > 1 ? previous.slice(0, -1) : previous))
    }

    const step = history[history.length - 1]
    return <SignInFlowContext.Provider value={{ email, setEmail, step, direction, goTo, back, thinking, setThinking }}>{children}</SignInFlowContext.Provider>
}

export function useSignInFlow(): SignInFlow {
    const value = useContext(SignInFlowContext)
    if (!value) throw new Error('useSignInFlow must be used inside SignInFlowProvider')
    return value
}
