// An error a route turns into a response with its own status, rather than a 500.
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message)
        this.name = 'ApiError'
    }
}
