import {
    forwardRef,
    useId,
    useRef,
    useState,
    createContext,
    useContext,
    type ButtonHTMLAttributes,
    type HTMLAttributes,
    type InputHTMLAttributes,
    type ReactNode,
    type SelectHTMLAttributes,
    type TextareaHTMLAttributes
} from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, ChevronDown, Upload, X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * React ports of the Origin UI NG primitives. The class anatomy follows the
 * public Origin UI registry at commit d785a610f510f5197a145f8c1a24249309bacd2d;
 * behavior is implemented with the Radix React packages already in this app.
 */
export const originButtonVariants = cva(
    'origin-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:ring-white/70 focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default: 'origin-button-default button button-primary',
                /** Backwards compatible spelling used by the first editor pass. */
                primary: 'origin-button-default button button-primary',
                outline: 'origin-button-outline button button-secondary',
                secondary: 'origin-button-secondary button button-secondary',
                ghost: 'origin-button-ghost button button-ghost',
                destructive: 'origin-button-destructive button button-danger',
                /** Backwards compatible spelling used by the first editor pass. */
                danger: 'origin-button-destructive button button-danger',
                link: 'origin-button-link button button-ghost'
            },
            size: {
                default: 'h-9 px-4 py-2',
                small: 'h-8 rounded-lg px-3 text-xs button-small',
                sm: 'h-8 rounded-lg px-3 text-xs button-small',
                large: 'h-10 rounded-lg px-8 button-large',
                lg: 'h-10 rounded-lg px-8 button-large',
                icon: 'h-9 w-9 button-icon'
            }
        },
        defaultVariants: { variant: 'default', size: 'default' }
    }
);
export type OriginButtonVariant = NonNullable<VariantProps<typeof originButtonVariants>['variant']>;
export type OriginButtonSize = NonNullable<VariantProps<typeof originButtonVariants>['size']>;

export type OriginButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof originButtonVariants> & { asChild?: boolean };

export const OriginButton = forwardRef<HTMLButtonElement, OriginButtonProps>(
    ({ className, variant, size, asChild, type = 'button', ...props }, ref) => {
        const Component = asChild ? Slot : 'button';
        return <Component ref={ref} type={type} className={cn(originButtonVariants({ variant, size }), className)} {...props} />;
    }
);
OriginButton.displayName = 'OriginButton';

/** Existing app name retained as a stable migration wrapper. */
export const Button = OriginButton;

export function IconButton({ label, children, className, size = 'icon', variant = 'ghost', ...props }: OriginButtonProps & { label: string }) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>
                <OriginButton size={size} variant={variant} className={className} aria-label={label} {...props}>
                    {children}
                </OriginButton>
            </Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content className="origin-tooltip" sideOffset={8}>
                    {label}
                    <Tooltip.Arrow />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

export type FieldMessageProps = { label?: string; help?: string; error?: string; id?: string; children: ReactNode };
export function Field({ label, help, error, id, children }: FieldMessageProps) {
    return (
        <div className="origin-field">
            {label && <label className="origin-field-label" htmlFor={id}>{label}</label>}
            {children}
            {error ? <p className="origin-field-error" role="alert">{error}</p> : help ? <p className="origin-field-help">{help}</p> : null}
        </div>
    );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Omit<FieldMessageProps, 'children'>>(
    ({ className, label, help, error, id: providedId, ...props }, ref) => {
        const generatedId = useId();
        const id = providedId ?? generatedId;
        return (
            <Field label={label} help={help} error={error} id={id}>
                <input ref={ref} id={id} aria-invalid={error ? true : undefined} className={cn('origin-input', className)} {...props} />
            </Field>
        );
    }
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldMessageProps, 'children'>>(
    ({ className, label, help, error, id: providedId, ...props }, ref) => {
        const generatedId = useId();
        const id = providedId ?? generatedId;
        return (
            <Field label={label} help={help} error={error} id={id}>
                <textarea ref={ref} id={id} aria-invalid={error ? true : undefined} className={cn('origin-textarea', className)} {...props} />
            </Field>
        );
    }
);
Textarea.displayName = 'Textarea';

export function NativeSelect({ label, help, error, className, children, id: providedId, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Omit<FieldMessageProps, 'children'>) {
    const generatedId = useId();
    const id = providedId ?? generatedId;
    return (
        <Field label={label} help={help} error={error} id={id}>
            <span className="origin-select-wrap">
                <select id={id} aria-invalid={error ? true : undefined} className={cn('origin-select', className)} {...props}>{children}</select>
                <ChevronDown aria-hidden="true" size={16} />
            </span>
        </Field>
    );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = .01, display, disabled = false, help, className }: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
    step?: number;
    display?: string;
    disabled?: boolean;
    help?: string;
    className?: string;
}) {
    const id = useId();
    return (
        <div className={cn('origin-slider-field slider-field', disabled && 'is-disabled', className)}>
            <div className="origin-field-label-row field-label"><label id={id}>{label}</label><output className="mono">{display ?? value}</output></div>
            <SliderPrimitive.Root className="origin-slider slider" aria-labelledby={id} value={[value]} onValueChange={([next]) => next !== undefined && onChange(next)} min={min} max={max} step={step} disabled={disabled}>
                <SliderPrimitive.Track className="origin-slider-track slider-track"><SliderPrimitive.Range className="origin-slider-range slider-range" /></SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="origin-slider-thumb slider-thumb" aria-valuetext={display ?? String(value)} />
            </SliderPrimitive.Root>
            {help && <p className="origin-field-help">{help}</p>}
        </div>
    );
}

export function Switch({ label, description, checked, onChange, disabled = false, className }: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    className?: string;
}) {
    const id = useId();
    return (
        <div className={cn('origin-switch-field switch-field', disabled && 'is-disabled', className)}>
            <label htmlFor={id}><span>{label}</span>{description && <small>{description}</small>}</label>
            <SwitchPrimitive.Root id={id} aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} className="origin-switch switch">
                <SwitchPrimitive.Thumb className="origin-switch-thumb switch-thumb" />
            </SwitchPrimitive.Root>
        </div>
    );
}

export function Segmented<T extends string>({ label, value, items, onChange, className }: {
    label: string;
    value: T;
    items: { value: T; label: ReactNode; disabled?: boolean; disabledReason?: string }[];
    onChange: (v: T) => void;
    className?: string;
}) {
    return (
        <div className={cn('origin-segmented segmented', className)} role="group" aria-label={label}>
            {items.map(item => <button key={item.value} type="button" className={cn('origin-segmented-item', value === item.value && 'selected')} aria-pressed={value === item.value} title={item.disabled ? (item.disabledReason ?? `${item.value} is unavailable`) : undefined} disabled={item.disabled} onClick={() => onChange(item.value)}>{item.label}</button>)}
        </div>
    );
}

export function Tabs({ value, defaultValue, onValueChange, children, className }: { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; children: ReactNode; className?: string }) {
    const [internal, setInternal] = useState(defaultValue ?? '');
    const selected = value ?? internal;
    const set = (next: string) => { if (value === undefined) setInternal(next); onValueChange?.(next); };
    return <TabsContext.Provider value={{ value: selected, set }}>{<div className={cn('origin-tabs', className)}>{children}</div>}</TabsContext.Provider>;
}

type TabsContextValue = { value: string; set: (value: string) => void };
const TabsContext = createContext<TabsContextValue>({ value: '', set: () => undefined });
export function TabsList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div role="tablist" className={cn('origin-tabs-list', className)} {...props}>{children}</div>; }
export function TabsTrigger({ value, children, className, disabled = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
    const tabs = useContext(TabsContext), active = tabs.value === value;
    return <button type="button" role="tab" aria-selected={active} data-state={active ? 'active' : 'inactive'} disabled={disabled} className={cn('origin-tabs-trigger', active && 'is-active', className)} onClick={() => tabs.set(value)} {...props}>{children}</button>;
}
export function TabsContent({ value, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
    const tabs = useContext(TabsContext);
    if (tabs.value !== value) return null;
    return <div role="tabpanel" className={cn('origin-tabs-content', className)} {...props}>{children}</div>;
}

export function Stepper({ steps, current, onChange, className }: { steps: { id: string; label: string; description?: string; disabled?: boolean }[]; current: string; onChange?: (id: string) => void; className?: string }) {
    return <nav className={cn('origin-stepper', className)} aria-label="Progress"><ol>{steps.map((step, index) => { const active = step.id === current, complete = steps.findIndex(s => s.id === current) > index; return <li key={step.id} className={cn(active && 'is-active', complete && 'is-complete')}><button type="button" disabled={step.disabled || !onChange} aria-current={active ? 'step' : undefined} onClick={() => onChange?.(step.id)}><span className="origin-stepper-indicator">{complete ? <Check size={14} /> : index + 1}</span><span><strong>{step.label}</strong>{step.description && <small>{step.description}</small>}</span></button>{index < steps.length - 1 && <span className="origin-stepper-separator" aria-hidden="true" />}</li>;})}</ol></nav>;
}

export function Alert({ title, children, variant = 'default', className }: { title?: string; children: ReactNode; variant?: 'default' | 'destructive'; className?: string }) {
    return <div role="alert" className={cn('origin-alert', variant === 'destructive' && 'origin-alert-destructive', className)}>{title && <strong>{title}</strong>}<div>{children}</div></div>;
}
export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('origin-card', className)} {...props}>{children}</div>; }
export function Badge({ children, variant = 'default', className }: { children: ReactNode; variant?: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }) { return <span className={cn('origin-badge', `origin-badge-${variant}`, className)}>{children}</span>; }

export function Modal({ open, onOpenChange, title, description, children, wide = false, sheet = false }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean; sheet?: boolean }) {
    return <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} wide={wide} sheet={sheet}>{children}</Dialog>;
}

export function Dialog({ open, onOpenChange, title, description, children, wide = false, sheet = false }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean; sheet?: boolean }) {
    return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="origin-dialog-overlay dialog-overlay" /><DialogPrimitive.Content className={cn('origin-dialog dialog', wide && 'dialog-wide', sheet && 'origin-bottom-sheet dialog-sheet')}><div className="origin-dialog-handle sheet-handle" /><header className="origin-dialog-header dialog-header"><div><DialogPrimitive.Title className="origin-dialog-title">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="origin-dialog-description">{description}</DialogPrimitive.Description>}</div><DialogPrimitive.Close asChild><OriginButton variant="ghost" size="icon" aria-label="Close dialog"><X size={18} /></OriginButton></DialogPrimitive.Close></header><div className="origin-dialog-body dialog-body">{children}</div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
export const BottomSheet = (props: Omit<Parameters<typeof Dialog>[0], 'sheet'>) => <Dialog {...props} sheet />;

export function FileUpload({ onFile, accept = 'video/*', disabled = false, children, className }: { onFile: (file: File) => void; accept?: string; disabled?: boolean; children?: ReactNode; className?: string }) {
    const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
    const choose = (files: FileList | null) => { const file = files?.[0]; if (file) onFile(file); };
    return <div className={cn('origin-file-upload', dragging && 'is-dragging', className)} onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => { e.preventDefault(); }} onDragLeave={e => { e.preventDefault(); setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}><input ref={input} className="sr-only" type="file" accept={accept} disabled={disabled} aria-label="Choose file" onChange={e => { choose(e.target.files); e.target.value = ''; }} /><OriginButton variant="default" size="large" disabled={disabled} onClick={() => input.current?.click()}><Upload size={16} />{children ?? 'Choose file'}</OriginButton><span className="origin-file-upload-help">or drop a file here</span></div>;
}

export { Tooltip };
