import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();

  // LocalWell-style two-step flow: mobile number → welcome → password.
  const [step, setStep] = useState<"mobile" | "password">("mobile");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectAfterAuth || "/dashboard");
    }
  }, [authLoading, isAuthenticated, navigate, redirectAfterAuth]);

  // MediBill keeps its own branding; user is matched against their number.
  const displayName = user?.name || mobile || "your pharmacy";

  const handleMobileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!/^[0-9]{10}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setStep("password");
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your password");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // MediBill's signIn takes (identifier, password); the mobile number is the identifier.
      await signIn(mobile, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 px-4 py-8 sm:px-6">
      {/* Hero glow behind the card, echoing LocalWell's login hero image */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative w-full max-w-[420px]">
        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-lg font-bold">M</span>
            </div>
          </div>

          {/* Title */}
          <div className="mt-5 text-center">
            <h1 className="text-xl font-semibold text-slate-900">Login or Sign Up</h1>
            <p className="mt-1 text-sm text-slate-500">GST Billing for Pharmacies</p>
          </div>

          {/* Mobile step */}
          {step === "mobile" && (
            <form onSubmit={handleMobileSubmit} className="mt-6">
              <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                Sign In to Continue
              </p>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-primary/40">
                <span className="pl-3 text-sm font-semibold text-slate-700">+91</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="Enter 10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  className="border-0 bg-transparent text-center shadow-none focus-visible:ring-0"
                  aria-label="Mobile number"
                />
                <span className="pr-3 text-xs tabular-nums text-slate-400">{mobile.length}/10</span>
              </div>
              <p className="mt-2 min-h-5 text-center text-sm text-red-500">{error}</p>
              <Button type="submit" className="mt-3 w-full rounded-full" disabled={isLoading}>
                Submit to Login
              </Button>
            </form>
          )}

          {/* Password step */}
          {step === "password" && (
            <>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setStep("mobile"); setError(null); }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              </div>
              <div className="mt-3 text-center">
                <p className="text-lg font-medium text-slate-900">Welcome, {displayName}!</p>
                <p className="text-sm text-slate-500">Login as a different User</p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="mt-5">
                <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  Enter Password to Login
                </p>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your Password here"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-lg border-slate-300 text-center"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-center text-sm text-red-500">{error}</p>
                <Button type="submit" className="mt-3 w-full rounded-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…
                    </>
                  ) : (
                    "Validate Now"
                  )}
                </Button>
                <p className="mt-2 text-center text-xs font-medium text-slate-500">Forgot Password?</p>
              </form>
            </>
          )}

          {/* Footer */}
          <div className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            <p>By continuing, you are agreeing to our</p>
            <p className="mt-0.5">
              <a href="#" className="font-medium text-primary hover:underline">Terms of Service</a>
              {" & "}
              <a href="#" className="font-medium text-primary hover:underline">Privacy Policy</a>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-white/60">
          MediBill · Enabling Pharmacies Since 2019
        </p>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Auth {...props} />
    </Suspense>
  );
}