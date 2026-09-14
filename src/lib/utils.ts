import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function timecode(t: number, decimals = false): string {
    const s = Math.max(0, Number.isFinite(t) ? t : 0);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}${decimals ? '.' + String(Math.floor(s * 100) % 100).padStart(2, '0') : ''}`;
}
export const bytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export { errorText, isAbort } from './errors';
export const yieldToBrowser = () => new Promise<void>(r => setTimeout(r, 0));
export function assertActive(signal: AbortSignal) {
    if (signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
}
export function repoUrl(): string | null {
    const configured = import.meta.env.VITE_REPOSITORY_URL as string | undefined;
    if (configured && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(configured))
        return configured;
    const host = location.hostname.match(/^([\w-]+)\.github\.io$/);
    const path = import.meta.env.BASE_URL.split('/').filter(Boolean)[0];
    return host && path ? `https://github.com/${host[1]}/${path}` : null;
}
