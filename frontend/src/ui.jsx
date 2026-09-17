import React from 'react'
import { cn } from './lib/cn'
import { Check, Loader, ThreadMark, X } from './icons'

const BTN_VARIANTS = {
  primary:
    'bg-neutral-800 text-white hover:bg-neutral-900 active:bg-neutral-950 disabled:bg-neutral-300',
  secondary:
    'bg-white text-neutral-800 border border-neutral-200 hover:border-neutral-400 disabled:text-neutral-300',
  ghost:
    'bg-transparent text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 disabled:text-neutral-300',
}

const BTN_SIZES = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-xs',
  md: 'h-10 gap-2 rounded-md px-4 text-sm',
  lg: 'h-11 gap-2 rounded-md px-5 text-sm',
  icon: 'size-8 rounded-md',
}

function buttonClasses({ variant = 'primary', size = 'md', className } = {}) {
  return cn(
    'inline-flex cursor-pointer items-center justify-center font-medium tracking-tight outline-none select-none',
    'transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
    'active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    BTN_SIZES[size],
    BTN_VARIANTS[variant],
    className,
  )
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />
}

export function LinkButton({ variant = 'secondary', size = 'md', className, ...props }) {
  return <a className={buttonClasses({ variant, size, className })} {...props} />
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  id,
  ...props
}) {
  const inputId = id || props.name
  return (
    <div className={cn('w-full font-sans', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-neutral-900">
          {label}
          {required ? (
            <span className="ml-0.5 text-rose-500" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        id={inputId}
        required={required}
        aria-invalid={error || undefined}
        className={cn(
          'h-10 w-full rounded-lg border bg-white px-3.5 font-sans text-sm text-neutral-900',
          'ring-0 outline-none transition-[border-color,background-color] duration-200',
          'placeholder:text-neutral-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
          error ? 'border-rose-300 focus:border-rose-400' : 'border-neutral-200 focus:border-neutral-900',
          className,
        )}
        {...props}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-rose-600">
          {typeof error === 'string' ? error : 'Please check this field.'}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  )
}

export function SegmentedControl({ options, value, onChange, size = 'md', className, ariaLabel = 'View' }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel || option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] font-medium tracking-tight outline-none transition-[background-color,color] duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const SPIN_SIZE = { sm: 14, md: 18, lg: 24 }

export function SpinLoader({ size = 'md', className, label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('inline-flex items-center justify-center text-neutral-400', className)}
    >
      <Loader
        className="animate-spin motion-reduce:animate-none"
        style={{ width: SPIN_SIZE[size], height: SPIN_SIZE[size] }}
        aria-hidden
      />
    </span>
  )
}

const ALERT_TONES = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-neutral-200 bg-neutral-50 text-neutral-600',
}

export function SystemAlert({ tone = 'error', title, description, onDismiss, className, children }) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs', ALERT_TONES[tone], className)}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-neutral-900">{title}</p> : null}
        <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{description ?? children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 md:px-6">
        <ThreadMark className="size-5 text-neutral-900" />
        <span className="font-serif text-lg leading-none">Davable</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-enter w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="font-serif text-2xl leading-tight text-balance">{title}</h1>
            {subtitle ? <p className="text-sm text-neutral-500">{subtitle}</p> : null}
          </div>
          <div className="space-y-4 rounded-2xl border border-neutral-100 bg-white p-5">{children}</div>
          {footer ? <div className="text-center text-xs text-neutral-500">{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}

export function Divider({ label = 'or' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-neutral-200" />
      <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase">{label}</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  )
}

export function BuildSteps({ steps, className }) {
  return (
    <ol className={cn('space-y-1.5', className)}>
      {steps.map((step, i) => {
        const isActive = !step.done && steps.slice(0, i).every((s) => s.done)
        return (
          <li key={step.label} className="flex items-center gap-2 text-xs">
            <span className="flex size-4 shrink-0 items-center justify-center">
              {step.done ? (
                <Check className="size-3 text-emerald-600" />
              ) : isActive ? (
                <SpinLoader size="sm" label={step.label} />
              ) : (
                <span className="size-1.5 rounded-full bg-neutral-300" />
              )}
            </span>
            <span
              className={cn(
                'tracking-tight',
                step.done
                  ? 'text-neutral-400 line-through'
                  : isActive
                    ? 'font-medium text-neutral-900'
                    : 'text-neutral-400',
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
