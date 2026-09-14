import { Check, Loader2, TriangleAlert, Minus, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { TaskState } from '../types/project';
import { bytes, cn } from '../lib/utils';
export function TaskRow({ title, task, compact = false }: {
    title: string;
    task: TaskState;
    compact?: boolean;
}) {
    return <div className={cn('task-row', `task-${task.status}`, compact && 'task-compact')}><div className="task-icon">{task.status === 'done' ? <Check size={15}/> : task.status === 'running' ? <Loader2 className="spin" size={15}/> : task.status === 'error' ? <TriangleAlert size={15}/> : task.status === 'cancelled' ? <Minus size={15}/> : <ArrowUpRight size={15}/>}</div><div className="task-copy"><strong>{title}</strong><span>{task.detail || 'Not started'}</span>{task.loaded !== undefined && task.total !== undefined && task.status === 'running' && <span className="mono download-bytes">{bytes(task.loaded)} / {bytes(task.total)} · current model file</span>}</div>{task.status === 'running' && task.progress !== undefined && <span className="task-percent mono">{Math.round(task.progress * 100)}%</span>}{task.status === 'running' && task.progress !== undefined && <motion.div className="task-progress" style={{ scaleX: Math.max(0, Math.min(1, task.progress)) }}/>}</div>;
}
