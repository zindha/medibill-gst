import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Cross,
  FileCheck,
  KeyRound,
  Loader2,
  MapPin,
  Phone,
  Ship,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const STEPS = [
  {
    title: "Name your store",
    description: "What should we call this pharmacy or medical store?",
  },
  {
    title: "Business details",
    description: "GSTIN and drug license keep your invoices compliant.",
  },
  {
    title: "Contact information",
    description: "Details shown on your GST invoices to your customers.",
  },
] as const;

export default function OnboardingPage() {
  const { isAuthenticated, myStores, user } = useAuth();
  const createStore = useMutation(api.stores.createStore);
  const joinStore = useMutation(api.stores.joinStoreByCode);
  const navigate = useNavigate();

  // "create" | "join"
  const [mode, setMode] = useState<"create" | "join">("create");
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [form, setForm] = useState({
    name: "",
    gstin: "",
    drugLicenseNo: "",
    phone: "",
    email: "",
    address: "",
  });

  // Already set up? Go to the dashboard.
  useEffect(() => {
    if (isAuthenticated && myStores && myStores.length > 0) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, myStores, navigate]);

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinue = mode === "create" ? form.name.trim().length >= 2 : true;

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else handleCreate();
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createStore({
        name: form.name.trim(),
        gstin: form.gstin.trim() || undefined,
        drugLicenseNo: form.drugLicenseNo.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      toast.success("Store set up — welcome!");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set up your store");
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await joinStore({ code: joinCode.trim() });
      toast.success(`You've joined ${res.name}`);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not join that store",
      );
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Cross className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="font-display font-semibold tracking-tight">
            {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Let's get you set up"}
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">
          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/70 border border-border mb-8">
            <button
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === "create"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("create")}
            >
              Create my store
            </button>
            <button
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === "join"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMode("join")}
            >
              Join a store
            </button>
          </div>

          {mode === "join" ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <div className="space-y-6">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight">
                      Join an existing store
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Already added to a pharmacy? Ask the store admin for their
                      join code and enter it here to get access right away.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-code">Join code</Label>
                    <Input
                      id="join-code"
                      autoFocus
                      placeholder="e.g. ABCD23"
                      value={joinCode}
                      onChange={(e) =>
                        setJoinCode(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && joinCode.trim() && handleJoin()
                      }
                      className="font-mono tracking-widest uppercase"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                  <Button
                    variant="ghost"
                    onClick={() => setMode("create")}
                    disabled={joining}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Create instead
                  </Button>
                  <Button onClick={handleJoin} disabled={!joinCode.trim() || joining}>
                    {joining ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Join store
                  </Button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-5">
                Not sure of the code? The store admin can share it from
                Settings → Invite others by code.
              </p>
            </motion.div>
          ) : (
            <>
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {STEPS.map((s, i) => (
                  <div key={s.title} className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        i <= step
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="h-px w-8 bg-border" />
                    )}
                  </div>
                ))}
              </div>

              <motion.div
                key={step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                  {step === 0 && (
                    <div className="space-y-6">
                      <div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">
                          {STEPS[0].title}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                          {STEPS[0].description}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="store-name">Store name *</Label>
                        <Input
                          id="store-name"
                          autoFocus
                          placeholder="e.g. Sunrise Medical Store"
                          value={form.name}
                          onChange={(e) => update("name")(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && canContinue && next()
                          }
                        />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-6">
                      <div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                          <FileCheck className="h-5 w-5" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">
                          {STEPS[1].title}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                          {STEPS[1].description} You can fill these in later
                          from Settings if you don't have them handy.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="gstin">GSTIN</Label>
                          <Input
                            id="gstin"
                            placeholder="22AAAAA0000A1Z5"
                            value={form.gstin}
                            onChange={(e) => update("gstin")(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="license">Drug license number</Label>
                          <Input
                            id="license"
                            placeholder="DL-MUM-…"
                            value={form.drugLicenseNo}
                            onChange={(e) =>
                              update("drugLicenseNo")(e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-6">
                      <div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                          <Ship className="h-5 w-5" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">
                          {STEPS[2].title}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                          {STEPS[2].description}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="phone"
                                className="pl-9"
                                placeholder="+91 98765 43210"
                                value={form.phone}
                                onChange={(e) =>
                                  update("phone")(e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              placeholder="store@example.com"
                              value={form.email}
                              onChange={(e) =>
                                update("email")(e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="address">Address</Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="address"
                              className="pl-9"
                              placeholder="Shop no, street, city, pincode"
                              value={form.address}
                              onChange={(e) =>
                                update("address")(e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                    <Button
                      variant="ghost"
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      disabled={step === 0 || creating}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button onClick={next} disabled={!canContinue || creating}>
                      {creating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : step === STEPS.length - 1 ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <ArrowRight className="mr-2 h-4 w-4" />
                      )}
                      {step === STEPS.length - 1 ? "Set up my store" : "Continue"}
                    </Button>
                  </div>
                </div>
              </motion.div>

              <p className="text-center text-xs text-muted-foreground mt-5">
                You can change all of these anytime from the Settings page.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}