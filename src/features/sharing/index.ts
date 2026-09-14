import type { ExportResult } from '../../types/project';
export function saveVideo(result: ExportResult) { const a = document.createElement('a'); a.href = result.url; a.download = result.name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
export function canShareVideo(result: ExportResult) {
    try {
        return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [new File([result.blob], result.name, { type: 'video/mp4' })] });
    }
    catch {
        return false;
    }
}
export async function shareVideo(result: ExportResult) {
    const file = new File([result.blob], result.name, { type: 'video/mp4' });
    if (!navigator.canShare?.({ files: [file] })) {
        saveVideo(result);
        return;
    }
    await navigator.share({ files: [file], title: 'My AutoEdit video' });
}
export async function clearModelCache() {
    if (!('caches' in globalThis))
        return;
    for (const key of await caches.keys())
        if (key.startsWith('creator-autoedit-models-'))
            await caches.delete(key);
}
