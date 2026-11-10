export const routes = {
    home: '/',
    auth: '/auth',
    authCallback: '/auth/callback',
    authCodeError: '/auth/auth-code-error',
    app: process.env.NEXT_PUBLIC_APP_URL || 'https://app.lumvika.com',
} as const
