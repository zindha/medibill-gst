import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  FileText,
  Package,
  ScanLine,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router";

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-background"
    >
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded bg-foreground flex items-center justify-center">
                <span className="text-background text-xs font-bold">M</span>
              </div>
              <span className="text-sm font-medium">MediBill</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/auth")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth")}
                className="bg-foreground text-background text-xs px-4 py-1.5 rounded-sm hover:opacity-90 transition-opacity"
              >
                {isAuthenticated ? "Dashboard" : "Get Started"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-border text-muted-foreground">
              <Shield className="h-3 w-3" />
              GST-compliant billing
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight"
          >
            Medical shop billing
            <br />
            <span className="text-muted-foreground">made simple</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed"
          >
            Create GST invoices, manage inventory, track suppliers, and scan
            purchase bills — all in one place. Clean, fast, and built for
            medical shops.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex items-center justify-center gap-3 pt-2"
          >
            <button
              onClick={() =>
                navigate(isAuthenticated ? "/dashboard" : "/auth")
              }
              className="bg-foreground text-background text-sm px-5 py-2 rounded-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              {isAuthenticated ? "Go to Dashboard" : "Start Billing"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {[
              {
                icon: FileText,
                title: "GST Billing",
                desc: "Auto-calculate CGST, SGST with configurable tax rates",
              },
              {
                icon: Package,
                title: "Inventory",
                desc: "Track medicines, batches, expiry, and stock levels",
              },
              {
                icon: Activity,
                title: "Invoice History",
                desc: "View, search, and print past invoices with GST breakdown",
              },
              {
                icon: ScanLine,
                title: "Bill Scanning",
                desc: "Scan purchase bills via camera or upload for auto-import",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
                className="bg-background p-6"
              >
                <feature.icon className="h-5 w-5 text-foreground mb-3" />
                <h3 className="text-sm font-medium mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            MediBill — Medical Shop Billing System
          </p>
          <p className="text-xs text-muted-foreground">Built with Freebuff</p>
        </div>
      </footer>
    </motion.div>
  );
}
