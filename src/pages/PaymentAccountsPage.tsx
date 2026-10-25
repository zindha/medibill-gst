import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import {
  paymentAccountsApi,
  type PaymentAccount,
  type PaymentAccountStatement,
  type PaymentAccountType,
} from "@/lib/paymentAccountsApi";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const ACCOUNT_TYPES: { value: PaymentAccountType; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank", label: "Bank", icon: Landmark },
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
];

const typeMeta = (type: string) =>
  ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];

/** Paise → display rupees. */
const money = (minor?: number | null) =>
  `₹${((Number(minor) || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Rupee text field → paise integer. */
const toMinor = (rupees: string) => Math.round((Number(rupees) || 0) * 100);

const formatDateTime = (value: string | number) =>
  new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function exportCSV(data: any[], filename: string, columns: { key: string; header: string }[]) {
  if (!data || data.length === 0) {
    toast.error("No data to export");
    return;
  }
  const header = columns.map((c) => c.header).join(",");
  const rows = data.map((row) =>
    columns
      .map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface AccountForm {
  name: string;
  type: PaymentAccountType;
  openingBalance: string;
  bankName: string;
  ifsc: string;
  accountNumberMasked: string;
  accountHolder: string;
  upiId: string;
}

const emptyForm: AccountForm = {
  name: "",
  type: "bank",
  openingBalance: "0",
  bankName: "",
  ifsc: "",
  accountNumberMasked: "",
  accountHolder: "",
  upiId: "",
};

export default function PaymentAccountsPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === "admin" || user?.role === "pharmacist";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);

  // Statement drawer
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const [statement, setStatement] = useState<PaymentAccountStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Add / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Adjust dialog
  const [adjustDirection, setAdjustDirection] = useState<"add" | "reduce" | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const openAccount = accounts.find((a) => a.id === openAccountId) ?? null;

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      setAccounts(await paymentAccountsApi.list());
    } catch (err: any) {
      const message = err?.message ?? "Failed to load payment accounts";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadStatement = useCallback(async (id: string) => {
    setStatementLoading(true);
    try {
      setStatement(await paymentAccountsApi.statement(id));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load statement");
    } finally {
      setStatementLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const openForm = (account?: PaymentAccount) => {
    setEditingId(account?.id ?? null);
    setForm(
      account
        ? {
            name: account.name,
            type: account.type,
            openingBalance: String(account.openingBalanceMinor / 100),
            bankName: account.bankName ?? "",
            ifsc: account.ifsc ?? "",
            accountNumberMasked: account.accountNumberMasked ?? "",
            accountHolder: account.accountHolder ?? "",
            upiId: account.upiId ?? "",
          }
        : emptyForm
    );
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) {
      toast.error("Account name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      openingBalanceMinor: toMinor(form.openingBalance),
      bankName: form.bankName.trim() || undefined,
      ifsc: form.ifsc.trim() || undefined,
      accountNumberMasked: form.accountNumberMasked.trim() || undefined,
      accountHolder: form.accountHolder.trim() || undefined,
      upiId: form.upiId.trim() || undefined,
    };
    try {
      if (editingId) {
        await paymentAccountsApi.update(editingId, payload);
        toast.success("Account updated");
      } else {
        await paymentAccountsApi.create(payload);
        toast.success("Account created");
      }
      setFormOpen(false);
      await load();
      if (openAccountId) await loadStatement(openAccountId);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const submitAdjust = async () => {
    if (!openAccountId || !adjustDirection) return;
    const amountMinor = toMinor(adjustAmount);
    if (amountMinor <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    setAdjusting(true);
    try {
      await paymentAccountsApi.adjust(openAccountId, {
        direction: adjustDirection,
        amountMinor,
        reason: adjustReason.trim() || undefined,
      });
      toast.success(adjustDirection === "add" ? "Money added" : "Money reduced");
      setAdjustDirection(null);
      setAdjustAmount("");
      setAdjustReason("");
      await Promise.all([load(), loadStatement(openAccountId)]);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to adjust balance");
    } finally {
      setAdjusting(false);
    }
  };

  if (!authLoading && !isAuthenticated) {
    navigate("/auth");
    return null;
  }
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Payment Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cash drawers, bank accounts, UPI handles and card settlements — each with its own
            balance and statement
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => openForm()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add account
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading accounts…
        </div>
      ) : error && accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Failed to load accounts"
          description={error}
          actions={[{ label: "Retry", onClick: () => void load() }]}
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payment accounts yet"
          description="Add a cash drawer, a bank account or a UPI handle to start tracking money by pocket."
          actions={canManage ? [{ label: "Add account", onClick: () => openForm() }] : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {accounts.map((account) => {
            const meta = typeMeta(account.type);
            const Icon = meta.icon;
            const detail =
              account.accountNumberMasked ||
              account.upiId ||
              account.bankName ||
              (account.type === "cash" ? "Cash in hand" : "—");
            return (
              <Card
                key={account.id}
                className="p-4 border-border/60 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => {
                  setOpenAccountId(account.id);
                  setStatement(null);
                  void loadStatement(account.id);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border/60 bg-secondary/40">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{account.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {meta.label} · {detail}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Edit ${account.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openForm(account);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-lg font-semibold font-mono">{money(account.balanceMinor)}</p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Account statement drawer */}
      <Sheet
        open={!!openAccountId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenAccountId(null);
            setStatement(null);
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {openAccount && (() => {
                const Icon = typeMeta(openAccount.type).icon;
                return <Icon className="h-4 w-4" />;
              })()}
              {openAccount?.name}
            </SheetTitle>
            <SheetDescription>
              {openAccount &&
                `${typeMeta(openAccount.type).label}${
                  openAccount.accountNumberMasked ? ` · ${openAccount.accountNumberMasked}` : ""
                }${openAccount.upiId ? ` · ${openAccount.upiId}` : ""}`}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Current balance</p>
                <p
                  className={`text-xl font-semibold font-mono ${
                    (statement?.closingMinor ?? openAccount?.balanceMinor ?? 0) < 0
                      ? "text-red-600"
                      : ""
                  }`}
                >
                  {money(statement?.closingMinor ?? openAccount?.balanceMinor)}
                </p>
              </div>
              {canManage && openAccount && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAdjustDirection("add")}
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5 text-green-600" /> Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAdjustDirection("reduce")}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5 text-red-600" /> Reduce
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Statement</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  exportCSV(
                    (statement?.rows ?? []).map((row) => ({
                      dateText: formatDateTime(row.createdAt),
                      reason: row.reason || "",
                      refType: row.refType || "",
                      inText: row.direction === "in" ? money(row.amountMinor) : "",
                      outText: row.direction === "out" ? money(row.amountMinor) : "",
                      runningText: money(row.runningBalanceMinor),
                    })),
                    `statement_${openAccount?.name ?? "account"}`.replace(/\s+/g, "_").toLowerCase(),
                    [
                      { key: "dateText", header: "Date" },
                      { key: "reason", header: "Reason" },
                      { key: "refType", header: "Reference" },
                      { key: "inText", header: "In" },
                      { key: "outText", header: "Out" },
                      { key: "runningText", header: "Running Balance" },
                    ]
                  )
                }
              >
                CSV
              </Button>
            </div>

            {statementLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading statement…
              </div>
            ) : !statement || statement.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No movements yet. Add or reduce the balance to start the statement.
              </p>
            ) : (
              <Card className="border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm">
                          {row.reason || "—"}
                          {row.refType ? (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">
                              {row.refType}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-green-700">
                          {row.direction === "in" ? money(row.amountMinor) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-red-700">
                          {row.direction === "out" ? money(row.amountMinor) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">
                          {money(row.runningBalanceMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">
                        Closing balance
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {money(statement.closingMinor)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit account" : "Add payment account"}</DialogTitle>
            <DialogDescription>
              Amounts are stored exactly; enter rupees and paise as displayed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Account name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="HDFC Current / Cash Box"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as PaymentAccountType })}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Opening balance (₹)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                className="mt-1"
              />
            </div>

            {(form.type === "bank" || form.type === "card") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Bank name</Label>
                  <Input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">IFSC</Label>
                  <Input
                    value={form.ifsc}
                    onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Account no. (masked)</Label>
                  <Input
                    value={form.accountNumberMasked}
                    onChange={(e) => setForm({ ...form, accountNumberMasked: e.target.value })}
                    placeholder="**** 4821"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Account holder</Label>
                  <Input
                    value={form.accountHolder}
                    onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            {form.type === "upi" && (
              <div>
                <Label className="text-xs">UPI ID</Label>
                <Input
                  value={form.upiId}
                  onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                  placeholder="store@bank"
                  className="mt-1"
                />
              </div>
            )}

            <Button className="w-full" onClick={() => void saveForm()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {editingId ? "Save changes" : "Create account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog
        open={!!adjustDirection}
        onOpenChange={(open) => {
          if (!open) setAdjustDirection(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {adjustDirection === "add" ? "Add money" : "Reduce money"} — {openAccount?.name}
            </DialogTitle>
            <DialogDescription>
              Posts one movement to this account's statement with the running balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Cash deposit / owner withdrawal"
                className="mt-1"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => void submitAdjust()}
              disabled={adjusting}
            >
              {adjusting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {adjustDirection === "add" ? "Add" : "Reduce"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
