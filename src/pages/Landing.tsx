import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Cross,
  Database,
  FileText,
  Package,
  ScanLine,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router";

const features = [
  {
    icon: FileText,
    title: "GST Billing",
    desc: "Auto-calculated CGST & SGST, configurable tax rates, and printable GST invoices.",
    tint: "bg-primary/10 text-primary",
  },
  {
    icon: Package,
    title: "Smart Inventory",
    desc: "Batch-wise stock, expiry tracking, low-stock alerts, and barcode scanning.",
    tint: "bg-sky-500/10 text-sky-600",
  },
  {
    icon: Database,
    title: "2.4L+ Medicine Database",
    desc: "Search 2,43,000+ real medicines by name, brand, or composition — add to stock in one click.",
    tint: "bg-violet-500/10 text-violet-600",
  },
  {
    icon: ScanLine,
    title: "Scan Bills, Not Type Them",
    desc: "Photograph or upload purchase bills and import them straight into your books.",
    tint: "bg-teal-500/10 text-teal-600",
  },
  {
    icon: Wallet,
    title: "Payments & Udhar",
    desc: "Track paid, partial and unpaid bills. Know exactly who owes you, and how much.",
    tint: "bg-amber-500/10 text-amber-600",
  },
  {
    icon: Activity,
    title: "Insights That Matter",
    desc: "Revenue trends, GST registers, stock health, and a weekly billing rhythm you can see.",
    tint: "bg-red-500/10 text-red-600",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const go = () => navigate(isAuthenticated ? "/dashboard" : "/auth");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-background"
    >
      {/* Nav */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                <Cross className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <span className="font-display text-base font-semibold tracking-tight">
                MediBill
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/auth")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={go}
                className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
              >
                {isAuthenticated ? "Dashboard" : "Get Started"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-[46rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-24 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-7">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-border bg-card text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-primary" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Built for medical shops in India
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08]"
            >
              Medical shop billing,
              <br />
              <span className="text-primary">refreshingly</span> simple.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="text-base text-muted-foreground max-w-md leading-relaxed"
            >
              GST invoices, live inventory, payments, and a database of 2.4
              lakh+ medicines — in one calm, fast workspace that syncs across
              every device.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex items-center gap-3 pt-1"
            >
              <button
                onClick={go}
                className="bg-primary text-primary-foreground text-sm px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 shadow-sm"
              >
                {isAuthenticated ? "Go to Dashboard" : "Start Billing — it's free"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("features")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                Explore features
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-primary" />
                2,43,578 medicines
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                GST-ready invoices
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Real-time cloud sync
              </span>
            </motion.div>
          </div>

          {/* Product mock */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative"
          >
            <div className="float-slow absolute -top-4 -right-2 z-10 rounded-lg border border-border bg-card px-3 py-2 shadow-lg flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">2.4L+ medicine database</span>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {/* Mock window header */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-secondary/40">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 text-[10px] text-muted-foreground">
                  dashboard — today
                </span>
              </div>
              <div className="p-5 space-y-4">
                {/* Stat chips */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Sales", value: "₹12,480" },
                    { label: "Bills", value: "28" },
                    { label: "Stock", value: "1,204" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg border border-border/70 p-2.5 bg-background"
                    >
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        {s.label}
                      </p>
                      <p className="text-sm font-semibold mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
                {/* Bar chart */}
                <div className="rounded-lg border border-border/70 p-3 bg-background">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2">
                    Weekly rhythm
                  </p>
                  <div className="flex items-end gap-1.5 h-16">
                    {[35, 60, 45, 80, 55, 90, 70].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.8 + i * 0.08, duration: 0.5 }}
                        className={`flex-1 rounded-t ${i === 5 ? "bg-primary" : "bg-primary/35"}`}
                      />
                    ))}
                  </div>
                </div>
                {/* Invoice rows */}
                <div className="space-y-1.5">
                  {[
                    { no: "INV-2608-0007", name: "Ramesh Kumar", amt: "₹482" },
                    { no: "INV-2608-0006", name: "Sita Clinic", amt: "₹1,150" },
                    { no: "INV-2608-0005", name: "Walk-in", amt: "₹96" },
                  ].map((r) => (
                    <div
                      key={r.no}
                      className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-xs bg-background"
                    >
                      <span className="text-muted-foreground">{r.no}</span>
                      <span className="font-medium">{r.name}</span>
                      <span className="font-semibold">{r.amt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-y border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            { value: "2.4L+", label: "medicines in the built-in database" },
            { value: "0", label: "typing needed for purchase bills" },
            { value: "100%", label: "GST-compliant invoices, every time" },
          ].map((s) => (
            <div key={s.label}>
              <p className="font-display text-3xl font-semibold tracking-tight text-primary">
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 lg:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              Everything your shop needs,
              <br />
              nothing it doesn't.
            </h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              From the first bill of the morning to the last stock check at
              night — built to stay out of your way and keep you in the flow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.4 }}
                className="group rounded-xl border border-border/70 bg-card p-5 hover:border-border hover:shadow-lg transition-all duration-200"
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center mb-4 ${feature.tint} group-hover:scale-105 transition-transform`}
                >
                  <feature.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-display text-sm font-semibold mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto rounded-2xl border border-border bg-card px-6 py-12 text-center relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-primary/10 blur-3xl" />
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready to make billing the easy part?
          </h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
            Set up in minutes, use it on your phone, tablet, or desktop — and
            never type a purchase bill again.
          </p>
          <button
            onClick={go}
            className="mt-6 bg-primary text-primary-foreground text-sm px-6 py-2.5 rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 shadow-sm"
          >
            {isAuthenticated ? "Go to Dashboard" : "Start Billing"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            MediBill — Medical Shop Billing System
          </p>
          <p className="text-xs text-muted-foreground">GST-ready · India</p>
        </div>
      </footer>
    </motion.div>
  );
}
