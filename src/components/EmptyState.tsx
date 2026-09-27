import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
}

/**
 * Friendly onboarding/empty state used when a list has no data yet.
 */
export function EmptyState({ icon: Icon, title, description, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg px-6 py-12">
      <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {actions.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant || "default"} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
