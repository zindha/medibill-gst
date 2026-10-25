import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { orderbookApi, type Analysis } from "@/lib/orderbookApi";

const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#64748b", "#14b8a6"];

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#0ea5e9",
  confirmed: "#6366f1",
  partial: "#f59e0b",
  received: "#22c55e",
  cancelled: "#ef4444",
};

export default function OrderbookAnalysisPage() {
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    orderbookApi
      .analysis()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No analysis data yet.</p>;
  }

  const statusData = data.statusCounts.map((s) => ({ name: s.status, value: s.count }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Order analysis</h1>
        <p className="text-sm text-muted-foreground">Spending, top products and supplier performance</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend by month (last 6 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.spendByMonth.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.spendByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Spend"]} />
                  <Line type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order status distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {statusData.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label>
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top products by value</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.topProducts.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No ordered products yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Value"]} />
                  <Bar dataKey="amount" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fill rate by product (received / demanded)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.topProducts.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No receipts yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} height={60} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="quantity" name="Demanded" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="received" name="Received" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Overall fill rate: <span className="font-semibold text-foreground">{Math.round(data.fillRate * 100)}%</span>
      </p>
    </div>
  );
}
