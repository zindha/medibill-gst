import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, Check, Cross, FileCheck, KeyRound, Loader2, MapPin, Phone, Ship } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const STEPS = [
  { title: "Name your store", description: "What should we call this pharmacy or medical store?" },
  { title: "Business details", description: "GSTIN and drug license keep your invoices compliant." },
  { title: "Contact information", description: "Details shown on your GST invoices." },
] as const;

export default function OnboardingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", gstin: "", drugLicenseNo: "", phone: "", email: "", address: "",
  });

  // Already set up? Go to dashboard
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinue = form.name.trim().length >= 2;

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else handleSave();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { settingsApi } = await import("@/lib/api");
      await Promise.all([
        settingsApi.set("store_name", form.name.trim()),
        settingsApi.set("store_gstin", form.gstin.trim() || null),
        settingsApi.set("store_drug_license", form.drugLicenseNo.trim() || null),
        settingsApi.set("store_phone", form.phone.trim() || null),
        settingsApi.set("store_email", form.email.trim() || null),
        settingsApi.set("store_address", form.address.trim() || null),
      ]);
      toast.success("Store set up — welcome!");
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("Could not save store details");
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <header className="relative border-b border-border/70">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-1 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cross className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-display font-semibold tracking-tight">Set up your MediBill workspace</p>
            <p className="text-xs text-muted-foreground">A few details, then you’re ready to bill.</p>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center py-8 sm:py-12">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${i <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
              </div>
            ))}
          </div>

          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="rounded-2xl border border-border/70 bg-card/95 p-6 sm:p-8">
              {step === 0 && (
                <div className="space-y-6">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4"><Building2 className="h-5 w-5" /></div>
                    <h1 className="text-xl font-bold tracking-tight">{STEPS[0].title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{STEPS[0].description}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="store-name">Store name *</Label>
                    <Input id="store-name" name="storeName" autoFocus placeholder="e.g. Sunrise Medical Store…" value={form.name} onChange={(e) => update("name")(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (canContinue) next(); } }} />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4"><FileCheck className="h-5 w-5" /></div>
                    <h1 className="text-xl font-bold tracking-tight">{STEPS[1].title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{STEPS[1].description}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="gstin">GSTIN</Label>
                      <Input id="gstin" name="gstin" autoComplete="off" spellCheck={false} placeholder="22AAAAA0000A1Z5…" value={form.gstin} onChange={(e) => update("gstin")(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="license">Drug license number</Label>
                      <Input id="license" name="drugLicenseNo" autoComplete="off" spellCheck={false} placeholder="DL-MUM-…" value={form.drugLicenseNo} onChange={(e) => update("drugLicenseNo")(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4"><Ship className="h-5 w-5" /></div>
                    <h1 className="text-xl font-bold tracking-tight">{STEPS[2].title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{STEPS[2].description}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" className="pl-9" placeholder="+91 98765 43210…" value={form.phone} onChange={(e) => update("phone")(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="storeEmail" type="email" autoComplete="email" spellCheck={false} placeholder="store@example.com…" value={form.email} onChange={(e) => update("email")(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="address">Address</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="address" name="address" autoComplete="street-address" className="pl-9" placeholder="Shop no, street, city, pincode…" value={form.address} onChange={(e) => update("address")(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
                <Button onClick={next} disabled={!canContinue || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : step === STEPS.length - 1 ? <Check className="mr-2 h-4 w-4" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {step === STEPS.length - 1 ? "Set up my store" : "Continue"}
                </Button>
              </div>
            </div>
          </motion.div>

          <p className="mt-5 text-center text-xs text-muted-foreground">You can change these details anytime from Settings.</p>
        </div>
      </main>
    </div>
  );
}
