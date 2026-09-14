import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as Dialog from '@radix-ui/react-dialog';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
const button = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', danger: 'button-danger' }, size: { default: '', small: 'button-small', icon: 'button-icon', large: 'button-large' } }, defaultVariants: { variant: 'secondary', size: 'default' } });
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & {
    asChild?: boolean;
}>(({ className, variant, size, asChild, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return <Component ref={ref} type="button" className={cn(button({ variant, size }), className)} {...props}/>;
});
Button.displayName = 'Button';
export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
}) {
    return <Tooltip.Root><Tooltip.Trigger asChild><Button size="icon" variant="ghost" aria-label={label} {...props}>{children}</Button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{label}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
export function Slider({ label, value, onChange, min = 0, max = 1, step = .01, display, disabled = false }: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
    step?: number;
    display?: string;
    disabled?: boolean;
}) {
    const id = useId();
    return <div className={cn('slider-field', disabled && 'is-disabled')}><div className="field-label"><label id={id}>{label}</label><output className="mono">{display ?? value}</output></div><SliderPrimitive.Root className="slider" aria-labelledby={id} value={[value]} onValueChange={([n]) => onChange(n)} min={min} max={max} step={step} disabled={disabled}><SliderPrimitive.Track className="slider-track"><SliderPrimitive.Range className="slider-range"/></SliderPrimitive.Track><SliderPrimitive.Thumb className="slider-thumb" aria-valuetext={display ?? String(value)}/></SliderPrimitive.Root></div>;
}
export function Switch({ label, description, checked, onChange, disabled = false }: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    const id = useId();
    return <div className={cn('switch-field', disabled && 'is-disabled')}><label htmlFor={id}><span>{label}</span>{description && <small>{description}</small>}</label><SwitchPrimitive.Root id={id} aria-label={label} title={disabled ? (description ?? `${label} is unavailable for this video`) : undefined} checked={checked} onCheckedChange={onChange} disabled={disabled} className="switch"><SwitchPrimitive.Thumb className="switch-thumb"/></SwitchPrimitive.Root></div>;
}
export function Segmented<T extends string>({ label, value, items, onChange }: {
    label: string;
    value: T;
    items: {
        value: T;
        label: ReactNode;
        disabled?: boolean;
        disabledReason?: string;
    }[];
    onChange: (v: T) => void;
}) {
    return <div className="segmented" role="group" aria-label={label}>{items.map(item => <button key={item.value} type="button" className={cn(value === item.value && 'selected')} aria-pressed={value === item.value} title={item.disabled ? (item.disabledReason ?? `${item.value} is unavailable`) : undefined} disabled={item.disabled} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}
export function Modal({ open, onOpenChange, title, description, children, wide = false, sheet = false }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
    wide?: boolean;
    sheet?: boolean;
}) {
    return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={cn('dialog', wide && 'dialog-wide', sheet && 'dialog-sheet')}><div className="sheet-handle"/><header className="dialog-header"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description ?? 'Creator AutoEdit · on-device editing'}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close dialog"><X size={19}/></Button></Dialog.Close></header><div className="dialog-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export { Tooltip };
