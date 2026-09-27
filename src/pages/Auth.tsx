import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Eye, EyeOff, Cross } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const redirect = redirectAfterAuth || "/dashboard";
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirectAfterAuth]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "register") {
        // Call register API
        const { authApi } = await import("@/lib/api");
        const result = await authApi.register({ name, email: identifier, password });
        const { setAuthToken } = await import("@/lib/api");
        setAuthToken(result.token);
        // Force reload to pick up new auth state
        window.location.reload();
      } else {
        await signIn(identifier, password);
        const redirect = redirectAfterAuth || "/dashboard";
        navigate(redirect);
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Card className="w-full max-w-[420px] gap-5 border-border/70 bg-card/95 pb-0">
            <CardHeader className="text-center">
              <button type="button" className="mx-auto mb-2 flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground" onClick={() => navigate("/")} aria-label="Go to MediBill home">
                <Cross className="h-6 w-6" strokeWidth={2.5} />
              </button>
              <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-primary">MediBill</p>
              <CardTitle className="text-xl">
                {mode === "login" ? "Welcome Back" : "Create Account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Sign in to your MediBill account"
                  : "Set up your pharmacy account"}
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {mode === "register" && (
                  <div className="relative">
                    <Input
                      name="name"
                      autoComplete="name"
                      placeholder="Full Name…"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                )}

                <div className="relative">
                  <Input
                    name="email"
                    type="email"
                    autoComplete={mode === "login" ? "username" : "email"}
                    spellCheck={false}
                    placeholder="Email address…"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="relative">
                  <Input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Password…"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <p className="text-sm text-red-500 mt-2" role="alert" aria-live="polite">{error}</p>
                )}
              </CardContent>

              <CardFooter className="flex-col gap-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mode === "login" ? "Signing in…" : "Creating account…"}
                    </>
                  ) : (
                    <>
                      {mode === "login" ? "Sign In" : "Create Account"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                {mode === "login" && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setMode("register");
                      setError(null);
                    }}
                  >
                    Create a new account
                  </Button>
                )}

                {mode === "register" && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    Already have an account? Sign in
                  </Button>
                )}
              </CardFooter>
            </form>

            <div className="border-t border-border bg-secondary/40 px-6 py-4 text-center text-xs text-muted-foreground">
              Pharmacy billing, made calm and simple.
            </div>
          </Card>
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
