import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  ScanLine,
  Settings,
  Stethoscope,
  Truck,
  Users,
  Wallet,
  RefreshCcw,
  Keyboard,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useHotkeys, formatKey } from "@/hooks/useHotkeys";

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: typeof FileText;
  run: () => void;
}

const NAV_ACTIONS: (Omit<PaletteAction, "run"> & { to: string })[] = [
  { id: "nav-dashboard", label: "Go to Dashboard", icon: LayoutDashboard, to: "/dashboard", hint: "G then D" },
  { id: "nav-billing", label: "New Bill", icon: FileText, to: "/dashboard/billing", hint: "G then B" },
  { id: "nav-invoices", label: "Go to Invoices", icon: Activity, to: "/dashboard/invoices", hint: "G then I" },
  { id: "nav-payments", label: "Go to Payments", icon: Wallet, to: "/dashboard/payments", hint: "G then P" },
  { id: "nav-inventory", label: "Go to Inventory", icon: Package, to: "/dashboard/inventory", hint: "G then S" },
  { id: "nav-purchases", label: "Go to Purchases", icon: Truck, to: "/dashboard/purchases", hint: "G then U" },
  { id: "nav-customers", label: "Go to Customers", icon: Users, to: "/dashboard/customers", hint: "G then C" },
  { id: "nav-doctors", label: "Go to Doctors", icon: Stethoscope, to: "/dashboard/doctors", hint: "G then O" },
  { id: "nav-prescriptions", label: "Go to Prescriptions", icon: ClipboardList, to: "/dashboard/prescriptions", hint: "G then X" },
  { id: "nav-suppliers", label: "Go to Suppliers", icon: Truck, to: "/dashboard/suppliers", hint: "G then V" },
  { id: "nav-reports", label: "Go to Reports", icon: BarChart3, to: "/dashboard/reports", hint: "G then R" },
  { id: "nav-accounting", label: "Go to Accounting", icon: BookOpen, to: "/dashboard/accounting", hint: "G then A" },
  { id: "nav-catalog", label: "Go to Medicine Database", icon: Database, to: "/dashboard/catalog", hint: "G then M" },
  { id: "nav-scan", label: "Scan Purchase Bill", icon: ScanLine, to: "/dashboard/scan", hint: "G then N" },
  { id: "nav-refills", label: "Refill Reminders", icon: BellRing, to: "/dashboard/refills", hint: "G then F" },
  { id: "nav-communications", label: "Communications", icon: MessageSquare, to: "/dashboard/communications", hint: "G then E" },
  { id: "nav-campaigns", label: "Campaigns & Offers", icon: Megaphone, to: "/dashboard/campaigns", hint: "G then L" },
  { id: "nav-returns", label: "Go to Returns", icon: RefreshCcw, to: "/dashboard/returns", hint: "G then T" },
  { id: "nav-settings", label: "Go to Settings", icon: Settings, to: "/dashboard/settings", hint: "G then ," },
];

/**
 * Global command palette (Ctrl+K) + G-then-X navigation.
 * Mount once inside the dashboard layout so every workspace page is keyboard-first.
 */
export function CommandPalette({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useHotkeys([
    { key: "ctrl+k", label: "Open command palette", allowInInputs: true, handler: () => setOpen((o) => !o) },
    // Filter first: a hint-less action must never crash the palette (an
    // unguarded a.hint!.toLowerCase() previously took down the dashboard).
    ...NAV_ACTIONS.filter((a) => a.hint).map((a) => ({
      key: a.hint!.toLowerCase().replace("then ", ""),
      label: a.label,
      handler: () => navigate(a.to),
    })),
    { key: "?", label: "Show keyboard shortcuts", handler: () => onShowShortcuts() },
  ]);

  // Ctrl+K inside Radix dialogs: cmdk input owns focus, fine to toggle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const actions: PaletteAction[] = NAV_ACTIONS.map((a) => ({
    ...a,
    run: () => {
      setOpen(false);
      navigate(a.to);
    },
  }));

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump anywhere — type a page or action, Enter to go.">
      <CommandInput placeholder="Type a page or action… (Esc closes)" />
      <CommandList>
        <CommandEmpty>No matches. Try "bill", "stock", or "backup".</CommandEmpty>
        <CommandGroup heading="Go to">
          {actions.map((a) => (
            <CommandItem key={a.id} value={a.label} onSelect={() => a.run()}>
              <a.icon className="h-4 w-4" />
              {a.label}
              {a.hint && <CommandShortcut>{formatKey(a.hint.toLowerCase().replace("then ", ""))}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Help">
          <CommandItem value="Keyboard shortcuts" onSelect={() => { setOpen(false); onShowShortcuts(); }}>
            <Keyboard className="h-4 w-4" />
            Show all keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
