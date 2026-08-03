"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function SitePageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="site-page-head">
      <div>
        {kicker ? <div className="site-page-kicker">{kicker}</div> : null}
        <h1 className="site-page-title">{title}</h1>
        {description ? <p className="site-page-desc">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function SiteSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="site-section">
      <div className="site-section-head">
        <div>
          <h2 className="site-section-title">{title}</h2>
          {description ? (
            <p className="site-section-desc">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SiteButton({
  variant = "primary",
  className,
  href,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "soft";
  href?: string;
}) {
  const classes = cn(
    "site-btn",
    variant === "primary" && "site-btn-primary",
    variant === "accent" && "site-btn-accent",
    variant === "ghost" && "site-btn-ghost",
    variant === "soft" && "site-btn-soft",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} style={props.style}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function SiteField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("site-field", className)}>
      <label className="site-label">{label}</label>
      {children}
    </div>
  );
}

export function SiteInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="site-input" {...props} />;
}

export function SiteTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="site-textarea" {...props} />;
}

export function SiteSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="site-select" {...props} />;
}

export function SitePill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "dark";
}) {
  return (
    <span className="site-pill" data-tone={tone === "neutral" ? undefined : tone}>
      {children}
    </span>
  );
}

export function SiteEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="site-empty">
      <strong>{title}</strong>
      {description ? <p style={{ marginTop: 8 }}>{description}</p> : null}
    </div>
  );
}

export function SiteSpinner({ label = "Loading workspace…" }: { label?: string }) {
  return <div className="site-spinner">{label}</div>;
}

export function SiteStep({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <div className="site-step">
      <span className="site-step-num">{number}</span>
      <span className="site-step-label">{label}</span>
    </div>
  );
}
