import { useRef, useState } from "react";
import { Button, Card, PageHeader, api, notify, useApi } from "@ecomcx/ecomweb-admin-sdk";
import { API, Hint } from "../ui";
import { t } from "../i18n";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ToolsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const { data: legacy, reload: reloadLegacy } = useApi<{ count: number }>(`${API}/tools/legacy`);
  const { data: legacyRedirects, reload: reloadRedirects } = useApi<{ count: number }>(`${API}/tools/legacy-redirects`);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { notify.error((e as Error).message); } finally { setBusy(""); }
  }
  const exportSettings = () => run("export", async () => {
    const data = await api.get(`${API}/settings/export`);
    download(`ecomcx-seo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  });
  const importSettings = (file: File) => run("import", async () => {
    let body: unknown;
    try { body = JSON.parse(await file.text()); } catch { throw new Error(t("tools.the_file_is_not_valid")); }
    await api.post(`${API}/settings/import`, body);
    notify.success(t("tools.settings_imported"));
  });
  const reset = () => {
    if (!confirm(t("tools.reset_all_seo_settings_to"))) return;
    run("reset", async () => { await api.post(`${API}/settings/reset`); notify.success(t("tools.default_settings_restored")); });
  };
  const migrate = () => run("legacy", async () => {
    const r = await api.post<{ affected: number }>(`${API}/tools/legacy`);
    notify.success(t("tools.migrated_seo_data_of_posts", { affected: r.affected }));
    reloadLegacy();
  });
  const migrateRedirects = () => run("legacy-redirects", async () => {
    const r = await api.post<{ affected: number }>(`${API}/tools/legacy-redirects`);
    notify.success(t("tools.migrated_redirects", { affected: r.affected }));
    reloadRedirects();
  });

  return (
    <>
      <PageHeader title={t("tools.seo_tools")} />
      <div className="ecx-grid">
        <Card title={t("tools.back_up_settings")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{t("tools.download_your_seo_settings_to")}</p>
          <div className="ecx-flex">
            <Button variant="secondary" loading={busy === "export"} onClick={exportSettings}>{t("tools.export_settings")}</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
            <Button variant="secondary" loading={busy === "import"} onClick={() => fileRef.current?.click()}>{t("tools.import_from_file")}</Button>
          </div>
        </Card>

        <Card title={t("tools.migrate_from_older_plugins")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{t("tools.copy_the_seo_title_seo")}</p>
          {legacy && legacy.count === 0 ? <Hint>{t("tools.no_seo_toolkit_data_to")}</Hint> : (
            <Button variant="secondary" loading={busy === "legacy"} disabled={!legacy} onClick={migrate}>{t("tools.migrate_data_posts", { value: legacy?.count ?? 0 })}</Button>
          )}
          <p className="ecx-muted">{t("tools.copy_the_rules_of_the")}</p>
          {legacyRedirects && legacyRedirects.count === 0 ? <Hint>{t("tools.no_redirects_to_migrate")}</Hint> : (
            <Button variant="secondary" loading={busy === "legacy-redirects"} disabled={!legacyRedirects} onClick={migrateRedirects}>{t("tools.migrate_redirects_rules", { value: legacyRedirects?.count ?? 0 })}</Button>
          )}
        </Card>

        <Card title={t("tools.restore_defaults")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{t("tools.reset_all_seo_settings_to_2")}</p>
          <Button variant="danger" loading={busy === "reset"} onClick={reset}>{t("tools.restore_defaults")}</Button>
        </Card>
      </div>
    </>
  );
}
