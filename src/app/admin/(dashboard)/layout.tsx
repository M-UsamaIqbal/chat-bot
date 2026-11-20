import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { getAdminContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // When Supabase isn't configured we can't authenticate — show guidance.
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Admin dashboard not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Supabase isn&apos;t configured yet. Add your Supabase keys to{" "}
            <code className="rounded bg-muted px-1">.env.local</code>, run the
            migration in <code className="rounded bg-muted px-1">supabase/migrations</code>,
            then create an admin user. See the README for full steps.
          </p>
        </div>
      </div>
    );
  }

  const admin = await getAdminContext();
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar email={admin.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
