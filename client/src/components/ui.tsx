import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDecimal, parseDecimal } from "@/lib/format";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const buttonVariants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export const Button = ({ variant = "primary", className, type = "button", ...props }: ButtonProps) => (
  <button type={type} className={cn("btn", buttonVariants[variant], className)} {...props} />
);

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal";
  onBlur?: () => void;
};

export const TextField = ({ id, label, value, onChange, required, maxLength, placeholder, autoComplete, inputMode, onBlur }: TextFieldProps) => (
  <label className="block" htmlFor={id}>
    <span className="field-label">
      {label}
      {required ? <span className="text-copper"> *</span> : null}
    </span>
    <input
      id={id}
      className="field-input"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      autoComplete={autoComplete ?? "off"}
      inputMode={inputMode}
      required={required}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

type AreaFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  onBlur?: () => void;
};

export const AreaField = ({ id, label, value, onChange, required, maxLength, onBlur }: AreaFieldProps) => (
  <label className="block" htmlFor={id}>
    <span className="field-label">
      {label}
      {required ? <span className="text-copper"> *</span> : null}
    </span>
    <textarea
      id={id}
      className="field-input min-h-24 resize-y"
      value={value}
      maxLength={maxLength}
      required={required}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
};

export const SelectField = ({ id, label, value, onChange, options, placeholder = "Selecione", required }: SelectFieldProps) => (
  <label className="block" htmlFor={id}>
    <span className="field-label">
      {label}
      {required ? <span className="text-copper"> *</span> : null}
    </span>
    <select id={id} className="field-input" value={value} required={required} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

type MoneyInputProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
  ariaLabel?: string;
};

export const MoneyInput = ({ id, label, value, onChange, required, ariaLabel }: MoneyInputProps) => {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatDecimal(value));

  useEffect(() => {
    if (!focused) setText(formatDecimal(value));
  }, [focused, value]);

  return (
    <label className="block" htmlFor={id}>
      {label ? (
        <span className="field-label">
          {label}
          {required ? <span className="text-copper"> *</span> : null}
        </span>
      ) : null}
      <input
        id={id}
        aria-label={ariaLabel ?? (label || undefined)}
        className="field-input tabular-nums"
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          const parsed = parseDecimal(text);
          onChange(parsed);
          setText(formatDecimal(parsed));
          setFocused(false);
        }}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseDecimal(event.target.value));
        }}
      />
    </label>
  );
};

export const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
    {children}
  </p>
);

export const EmptyState = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => (
  <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
    <p className="font-display text-lg font-medium">{title}</p>
    <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const StatusBadge = ({ status }: { status: string }) => {
  const settled = status === "pago" || status === "recebido";
  const label = status === "pago" ? "Pago" : status === "recebido" ? "Recebido" : "Pendente";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        settled && "bg-emerald-100 text-emerald-800",
        !settled && "bg-amber-100 text-amber-900",
      )}
    >
      {label}
    </span>
  );
};

type ScreenProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  fill?: boolean;
  children: ReactNode;
};

export const Screen = ({ title, description, actions, fill, children }: ScreenProps) => (
  <div className="flex h-full min-h-0 flex-col">
    <header className="no-print flex shrink-0 items-start justify-between gap-4 px-5 pt-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
    <div className={cn("min-h-0 flex-1 px-5 py-4", fill ? "overflow-hidden" : "overflow-auto")}>{children}</div>
  </div>
);
