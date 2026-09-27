import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKey, useAllHotkeys } from "@/hooks/useHotkeys";

/** "?" overlay listing every registered hotkey, grouped by prefix. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const all = useAllHotkeys();
  const seen = new Map<string, string>();
  for (const b of all) {
    if (!seen.has(b.key)) seen.set(b.key, b.label);
  }
  const nav = [...seen.entries()].filter(([k]) => k.startsWith("g "));
  const global = [...seen.entries()].filter(([k]) => !k.startsWith("g "));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Every page is keyboard-first. Esc closes any dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-4 overflow-y-auto">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Everywhere</p>
            <ul className="space-y-1">
              {global.map(([key, label]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">{formatKey(key)}</kbd>
                </li>
              ))}
              {global.length === 0 && <li className="text-sm text-muted-foreground">No global shortcuts on this page.</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Jump to (press G, then…)</p>
            <ul className="space-y-1">
              {nav.map(([key, label]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">{formatKey(key)}</kbd>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">In pickers & rows</p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center justify-between"><span>Move in results</span><kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">↑↓</kbd></li>
              <li className="flex items-center justify-between"><span>Add highlighted result</span><kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd></li>
              <li className="flex items-center justify-between"><span>Bill row: box → box → next row</span><kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd></li>
              <li className="flex items-center justify-between"><span>Dialogs & forms: box → box → primary button</span><kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd></li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
