import React from 'react'
import { CheckIcon, MoonIcon, SunIcon, XIcon } from 'lucide-react'

import { Button as ShadButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ThreadMark } from './icons'
import { useTheme } from './theme'

// Map the app's legacy variant names onto shadcn's.
const BTN_VARIANTS = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
}

const BTN_SIZES = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  icon: 'icon',
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }) {
  return (
    <ShadButton
      type={type}
      variant={BTN_VARIANTS[variant] || variant}
      size={BTN_SIZES[size] || size}
      className={className}
      {...props}
    />
  )
}

export function LinkButton({ variant = 'secondary', size = 'md', className, ...props }) {
  return (
    <ShadButton
      asChild
      variant={BTN_VARIANTS[variant] || variant}
      size={BTN_SIZES[size] || size}
      className={className}
    >
      <a {...props} />
    </ShadButton>
  )
}

export function ThemeToggle({ className }) {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

export function TextField({ label, hint, error, required, className, containerClassName, id, ...props }) {
  const inputId = id || props.name
  const invalid = Boolean(error)
  return (
    <Field data-invalid={invalid || undefined} className={containerClassName}>
      {label ? (
        <FieldLabel htmlFor={inputId}>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </FieldLabel>
      ) : null}
      <Input
        id={inputId}
        required={required}
        aria-invalid={invalid || undefined}
        className={className}
        {...props}
      />
      {error ? (
        <FieldError>{typeof error === 'string' ? error : 'Please check this field.'}</FieldError>
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  )
}

export function SegmentedControl({ options, value, onChange, size = 'md', className, ariaLabel = 'View' }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      size={size === 'sm' ? 'sm' : 'default'}
      variant="outline"
      aria-label={ariaLabel}
      className={className}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel || option.label}
        >
          {option.icon}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const SPIN_SIZE = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }

export function SpinLoader({ size = 'md', className, label = 'Loading' }) {
  return <Spinner aria-label={label} className={`${SPIN_SIZE[size]} ${className || ''}`} />
}

const ALERT_TONES = {
  error: 'destructive',
  warn: 'default',
  info: 'default',
}

export function SystemAlert({ tone = 'error', title, description, onDismiss, className, children }) {
  return (
    <Alert variant={ALERT_TONES[tone]} className={className}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{description ?? children}</AlertDescription>
      {onDismiss ? (
        <AlertAction>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
            <XIcon />
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex items-center gap-2 border-b px-4 py-3 md:px-6">
        <ThreadMark className="size-5 text-foreground" />
        <span className="font-serif text-lg leading-none">Davable</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-enter w-full max-w-sm">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="font-serif text-2xl leading-tight text-balance">{title}</CardTitle>
              {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">{children}</CardContent>
            {footer ? <CardFooter className="justify-center text-xs text-muted-foreground">{footer}</CardFooter> : null}
          </Card>
        </div>
      </main>
    </div>
  )
}

export function Divider({ label = 'or' }) {
  if (!label) return <Separator />
  return (
    <div className="relative flex items-center">
      <Separator className="absolute inset-x-0" />
      <span className="relative mx-auto bg-card px-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}

export function BuildSteps({ steps, className }) {
  return (
    <ol className={className ? `flex flex-col gap-1.5 ${className}` : 'flex flex-col gap-1.5'}>
      {steps.map((step, i) => {
        const isActive = !step.done && steps.slice(0, i).every((s) => s.done)
        return (
          <li key={step.label} className="flex items-center gap-2 text-xs">
            <span className="flex size-4 shrink-0 items-center justify-center">
              {step.done ? (
                <CheckIcon className="size-3 text-muted-foreground" />
              ) : isActive ? (
                <SpinLoader size="sm" label={step.label} />
              ) : (
                <span className="size-1.5 rounded-full bg-border" />
              )}
            </span>
            <span
              className={
                step.done
                  ? 'text-muted-foreground line-through'
                  : isActive
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
              }
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
