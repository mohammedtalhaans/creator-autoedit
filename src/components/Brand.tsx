import { ArrowUpRight, Github } from 'lucide-react';
import { repoUrl } from '../lib/utils';
import { Button } from './ui/primitives';
export function Brand({ compact = false, onClick }: {
    compact?: boolean;
    onClick?: () => void;
}) {
    return <button type="button" onClick={onClick} className="brand" aria-label="Creator AutoEdit home"><img src={`${import.meta.env.BASE_URL}mark.svg`} width="30" height="30" alt=""/><span>{!compact && <span className="brand-creator">Creator </span>}AutoEdit<span className="brand-dot" aria-hidden="true">.</span></span></button>;
}
export function RepositoryLink({ onAbout, label = 'View source' }: {
    onAbout: () => void;
    label?: string;
}) {
    const url = repoUrl();
    return url ? <a className="source-link" href={url} target="_blank" rel="noopener noreferrer"><Github size={15}/>{label}<ArrowUpRight size={14}/></a> : <Button variant="ghost" size="small" onClick={onAbout}><Github size={15}/>About & source<ArrowUpRight size={14}/></Button>;
}
