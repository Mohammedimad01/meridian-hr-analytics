import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  action,
  footer,
  className,
  bodyClassName,
  children,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground", className)}
    >
      <header className="flex items-start justify-between gap-4 px-4 pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-medium text-foreground">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t px-4 py-3 text-xs text-muted-foreground">{footer}</footer>}
    </section>
  );
}
