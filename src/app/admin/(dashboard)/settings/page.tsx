import { getAdminContext } from "@/lib/auth";
import { resolveOrg } from "@/lib/org";
import { SettingsForm } from "@/components/admin/settings-form";
import { PUBLIC_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await getAdminContext();
  if (!admin) return null;

  const { config } = await resolveOrg(admin.organizationSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your assistant and grab the embed snippet for your site.
        </p>
      </div>
      <SettingsForm
        config={config}
        appUrl={PUBLIC_CONFIG.appUrl}
        orgSlug={admin.organizationSlug}
      />
    </div>
  );
}
