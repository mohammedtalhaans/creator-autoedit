const FALLBACK = 'Something interrupted this operation. Please try again.';
/** Preserve actionable messages, including plain-string capability and validation failures. */
export function errorText(error: unknown): string {
    if (typeof error === 'string' && error.trim()) return error;
    if (error instanceof Error && error.message.trim()) return error.message;
    if (error && typeof error === 'object' && 'message' in error &&
        typeof error.message === 'string' && error.message.trim()) return error.message;
    return FALLBACK;
}
export function isAbort(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
}
