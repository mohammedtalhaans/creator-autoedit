import type { AudioConfig, FramingConfig, TaskState } from '../types/project';
/** Async analysis may enrich a project, but may never undo newer user intent. */
export function resolvedFraming(current: FramingConfig, requested: FramingConfig, found: boolean): FramingConfig {
    if (current !== requested) return current;
    return { ...current, mode: found ? 'auto' : 'fill' };
}
export function acceptsVoiceResult(current: AudioConfig, requestedNoise: AudioConfig['noise']): boolean {
    return current.enabled && current.noise === requestedNoise;
}
/** A new operation must not inherit the previous operation's completion percentage/byte totals. */
export function mergeTask(previous: TaskState, patch: Partial<TaskState>): TaskState {
    const restart = patch.status === 'running' && previous.status !== 'running';
    return { ...(restart ? { status: 'running' as const, detail: '' } : previous), ...patch };
}
