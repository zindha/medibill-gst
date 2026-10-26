import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Eye, EyeOff } from "lucide-react";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 py-8 sm:px-6">
      {/* LocalWell login backdrop: pink→purple gradient, clipped diagonally */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          clipPath: "polygon(60% 0, 100% 0, 100% 100%, 5% 100%)",
          background: "linear-gradient(270deg, #fe316a, #832e8b)",
        }}
      />
      {/* Soft hero glow, echoing LocalWell's 32%-opacity hero image */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[1] h-full w-1/2 opacity-30"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 40%, rgba(254,49,106,0.35), transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[408px]">
        <div
          className="flex flex-col items-center gap-10 rounded-2xl bg-white p-10"
          style={{ boxShadow: "0 24px 64px 0 rgba(0,0,0,0.239)" }}
        >
          {/* Logo — MediBill mark on LocalWell's card */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-lg font-bold">M</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">MediBill</span>
          </div>

          {/* Title block */}
          <div className="text-center">
            <p className="text-base font-medium text-black">Login or Sign Up</p>
            <p className="mt-2 text-[13px] text-[#666]">GST Billing for Pharmacies</p>
          </div>

          {/* Mobile step */}
          {step === "mobile" && (
            <form onSubmit={handleMobileSubmit} className="w-full max-w-[328px]">
              <p className="mb-1.5 text-center text-[13px] font-medium tracking-wide text-foreground">
                Sign In to Continue
              </p>
              <div
                className="flex min-h-[44px] items-center rounded-lg border border-[#dadada] bg-white"
                style={{ boxShadow: "inset 3px 3px 4px 1px rgba(0,0,0,0.04)" }}
              >
                <span className="pl-3 text-[13px] font-semibold text-foreground">+91</span>
                <input
                  type="number"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="Enter 10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  className="min-w-0 flex-1 border-none bg-transparent text-center text-sm font-medium text-black outline-none placeholder:font-normal placeholder:text-[#bdbdbd]"
                  aria-label="Mobile number"
                />
                <span className="pr-3 text-sm font-semibold tabular-nums text-[#757575]">
                  {mobile.length}<span className="font-normal">/10</span>
                </span>
              </div>
              <p className="mt-2 min-h-5 text-center text-[13px] text-[#fd1d1d]">{error}</p>
              <Button type="submit" className="mt-5 w-full" disabled={isLoading || mobile.length !== 10}>
                Submit to Login
              </Button>
            </form>
          )}

          {/* Password step */}
          {step === "password" && (
            <>
              <div className="w-full max-w-[328px]">
                <button
                  type="button"
                  onClick={() => { setStep("mobile"); setError(null); }}
                  className="text-[13px] font-medium text-brand hover:text-[#ad4164]"
                >
                  ← Login as a different User
                </button>
                <p className="mt-3 text-center text-[13px] text-black">
                  Welcome, <span className="font-semibold">{displayName}</span>!
                </p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="w-full max-w-[328px]">
                <p className="mb-1.5 text-center text-[13px] font-medium tracking-wide text-foreground">
                  Enter Password to Login
                </p>
                <div
                  className="relative flex min-h-[44px] items-center rounded-lg border border-[#dadada] bg-white focus-within:border-[2px] focus-within:border-brand-deep"
                  style={{ boxShadow: "inset 3px 3px 4px 1px rgba(0,0,0,0.04)" }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your Password here"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-w-0 flex-1 border-none bg-transparent px-3 text-center text-sm font-medium text-black outline-none placeholder:font-normal placeholder:text-[#bdbdbd]"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="pr-3 text-[#757575] hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-center text-[13px] text-[#fd1d1d]">{error}</p>
                <Button type="submit" className="mt-5 w-full" disabled={isLoading || !password}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…
                    </>
                  ) : (
                    "Validate Now"
                  )}
                </Button>
                <p className="mt-4 text-center text-[13px] font-medium text-[#757575]">Forgot Password?</p>
              </form>
            </>
          )}

          {/* Footer — LocalWell terms block */}
          <div className="mt-auto w-full text-center">
            <p className="text-[13px] text-black">By continuing, you are agreeing to our</p>
            <p className="mt-2 flex items-center justify-center gap-2 text-[13px]">
              <a href="#" className="font-semibold text-brand hover:underline">Terms of Service</a>
              <span className="text-black">&</span>
              <a href="#" className="font-semibold text-brand hover:underline">Privacy Policy</a>
            </p>
          </div>
        </div>
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