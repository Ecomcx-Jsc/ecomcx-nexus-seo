import { useRef, useState } from "react";
import { __, Button, Card, PageHeader, api, notify, useApi } from "@cms/admin-sdk";
import { API, Hint } from "../ui";

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
    try { body = JSON.parse(await file.text()); } catch { throw new Error(__("File không phải JSON hợp lệ")); }
    await api.post(`${API}/settings/import`, body);
    notify.success(__("Đã nhập cài đặt"));
  });
  const reset = () => {
    if (!confirm(__("Đưa mọi cài đặt SEO về mặc định? Dữ liệu SEO của từng bài, chuyển hướng và nhật ký 404 vẫn được giữ."))) return;
    run("reset", async () => { await api.post(`${API}/settings/reset`); notify.success(__("Đã khôi phục cài đặt mặc định")); });
  };
  const migrate = () => run("legacy", async () => {
    const r = await api.post<{ affected: number }>(`${API}/tools/legacy`);
    notify.success(__("Đã chuyển dữ liệu SEO của {0} bài", r.affected));
    reloadLegacy();
  });
  const migrateRedirects = () => run("legacy-redirects", async () => {
    const r = await api.post<{ affected: number }>(`${API}/tools/legacy-redirects`);
    notify.success(__("Đã chuyển {0} chuyển hướng", r.affected));
    reloadRedirects();
  });

  return (
    <>
      <PageHeader title={__("Công cụ SEO")} />
      <div className="ecx-grid">
        <Card title={__("Sao lưu cài đặt")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{__("Tải cài đặt SEO về máy để dùng lại cho website khác. Khoá Search Console và khoá IndexNow không được xuất.")}</p>
          <div className="ecx-flex">
            <Button variant="secondary" loading={busy === "export"} onClick={exportSettings}>{__("Xuất cài đặt")}</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
            <Button variant="secondary" loading={busy === "import"} onClick={() => fileRef.current?.click()}>{__("Nhập từ file")}</Button>
          </div>
        </Card>

        <Card title={__("Chuyển dữ liệu từ plugin cũ")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{__("Chép tiêu đề SEO, mô tả SEO và noindex do plugin SEO Toolkit lưu sang Ecomcx SEO. Bài đã có giá trị trong Ecomcx SEO được giữ nguyên.")}</p>
          {legacy && legacy.count === 0 ? <Hint>{__("Không có dữ liệu SEO Toolkit cần chuyển.")}</Hint> : (
            <Button variant="secondary" loading={busy === "legacy"} disabled={!legacy} onClick={migrate}>{__("Chuyển dữ liệu ({0} bài)", legacy?.count ?? 0)}</Button>
          )}
          <p className="ecx-muted">{__("Chép các quy tắc của plugin Chuyển hướng sang Ecomcx SEO (bỏ qua đường dẫn nguồn đã có). Sau đó nên tắt plugin Chuyển hướng để tránh xử lý hai lần.")}</p>
          {legacyRedirects && legacyRedirects.count === 0 ? <Hint>{__("Không có chuyển hướng cần chuyển.")}</Hint> : (
            <Button variant="secondary" loading={busy === "legacy-redirects"} disabled={!legacyRedirects} onClick={migrateRedirects}>{__("Chuyển chuyển hướng ({0} quy tắc)", legacyRedirects?.count ?? 0)}</Button>
          )}
        </Card>

        <Card title={__("Khôi phục mặc định")}>
          <p className="ecx-muted" style={{ marginTop: 0 }}>{__("Đưa toàn bộ cài đặt SEO về giá trị ban đầu.")}</p>
          <Button variant="danger" loading={busy === "reset"} onClick={reset}>{__("Khôi phục mặc định")}</Button>
        </Card>
      </div>
    </>
  );
}
