import { useState } from "react";
import { __, Button, Card, Input, Modal, PageHeader, Select, Textarea, useApi } from "@cms/admin-sdk";
import { BUSINESS_TYPES, schemaDef } from "../../../frontend/lib/schema-types";
import type { SchemaTemplate } from "../../../frontend/lib/settings";
import { SchemaCatalog, SchemaForm, newId } from "../schema-editor";
import { Hint, Icon, ImageField, Loading, Row, SettingsShell, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";

const DAYS = [["Mo", "T2"], ["Tu", "T3"], ["We", "T4"], ["Th", "T5"], ["Fr", "T6"], ["Sa", "T7"], ["Su", "CN"]] as const;

function TemplateEditor({ value, onChange, onClose }: { value: SchemaTemplate; onChange(t: SchemaTemplate): void; onClose(): void }) {
  const [t, setT] = useState(value);
  const { postTypes } = useContentTypes();
  const { data: cats } = useApi<{ items: Array<{ id: number; name: string }> }>("/admin/terms/category?pageSize=1000");
  const conds = t.conditions ?? [];
  const setCond = (i: number, c: SchemaTemplate["conditions"][number]) => setT({ ...t, conditions: conds.map((x, j) => (j === i ? c : x)) });
  return (
    <Modal open width={760} title={__("Mẫu schema: {0}", __(schemaDef(t.type)?.label ?? t.type))} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{__("Huỷ")}</Button><Button variant="primary" disabled={!t.name.trim()} onClick={() => onChange(t)}>{__("Lưu mẫu")}</Button></>}>
      <div className="ecx-grid">
        <Row label={__("Tên mẫu")}><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Row>
        <Row label={__("Áp dụng cho")} help={__("Mẫu được thêm vào mọi bài khớp ít nhất một điều kiện.")}>
          <div className="ecx-grid" style={{ gap: 8 }}>
            {conds.map((c, i) => (
              <div key={i} className="ecx-flex" style={{ flexWrap: "nowrap" }}>
                <Select style={{ width: 170 }} value={c.kind} onChange={(e) => setCond(i, { kind: e.target.value as any, value: undefined })}
                  options={[{ value: "all", label: __("Mọi bài") }, { value: "postType", label: __("Loại nội dung") }, { value: "term", label: __("Chuyên mục") }]} />
                {c.kind === "postType" && <Select style={{ flex: 1 }} value={String(c.value ?? "")} onChange={(e) => setCond(i, { ...c, value: e.target.value })}
                  options={[{ value: "", label: "—" }, ...postTypes.map((p) => ({ value: p.name, label: __(p.label) }))]} />}
                {c.kind === "term" && <Select style={{ flex: 1 }} value={String(c.value ?? "")} onChange={(e) => setCond(i, { ...c, value: Number(e.target.value) })}
                  options={[{ value: "", label: "—" }, ...(cats?.items ?? []).map((x) => ({ value: String(x.id), label: x.name }))]} />}
                <Button size="sm" variant="ghost" onClick={() => setT({ ...t, conditions: conds.filter((_, j) => j !== i) })} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
              </div>
            ))}
            <div><Button size="sm" variant="secondary" onClick={() => setT({ ...t, conditions: [...conds, { kind: "postType", value: "post" }] })}>{Icon.plus(14)} {__("Thêm điều kiện")}</Button></div>
          </div>
        </Row>
        <SchemaForm entry={t} onChange={(e) => setT({ ...t, data: e.data })} />
      </div>
    </Modal>
  );
}

export function SchemaPage() {
  const st = useSeoSettings();
  const [tab, setTab] = useHashTab("kg");
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<SchemaTemplate | null>(null);
  const s = st.settings;
  const kg = s?.knowledgeGraph;
  const set = (key: string, v: any) => st.patch(["knowledgeGraph", ...key.split(".")], v);
  const templates = s?.schema?.templates ?? [];
  const saveTemplate = (t: SchemaTemplate) => {
    st.patch(["schema", "templates"], templates.some((x) => x.id === t.id) ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t]);
    setEditing(null);
  };
  const tabs = [{ value: "kg", label: __("Tổ chức / cá nhân") }, { value: "local", label: "Local SEO" }, { value: "templates", label: __("Mẫu schema") }];

  return (
    <>
      <PageHeader title={__("Schema")} description={__("Dữ liệu có cấu trúc (JSON-LD) giúp Google hiểu website và hiển thị kết quả phong phú.")} />
      {!s || !kg ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          {s.modules?.schema === false && <Hint tone="warn">{__("Module Schema đang tắt — website không xuất JSON-LD.")}</Hint>}
          <Card>
            {tab === "kg" && (<>
              <Row label={__("Website đại diện cho")}>
                <Select value={kg.type} onChange={(e) => set("type", e.target.value)} options={[{ value: "organization", label: __("Tổ chức / doanh nghiệp") }, { value: "person", label: __("Cá nhân") }]} />
              </Row>
              <Row label={kg.type === "person" ? __("Họ tên") : __("Tên tổ chức")}><Input value={kg.name} onChange={(e) => set("name", e.target.value)} /></Row>
              <Row label={__("Tên khác")} help={__("Tên viết tắt hoặc tên thương mại.")}><Input value={kg.alternateName} onChange={(e) => set("alternateName", e.target.value)} /></Row>
              <Row label={kg.type === "person" ? __("Ảnh đại diện") : __("Logo")} help={__("Tối thiểu 112×112px, nền trong suốt hoặc trắng.")}><ImageField value={kg.logo} onChange={(v) => set("logo", v)} /></Row>
              <Row label={__("Mô tả")}><Textarea rows={3} value={kg.description} onChange={(e) => set("description", e.target.value)} /></Row>
              <Row label="URL" help={__("Để trống = địa chỉ website.")}><Input value={kg.url} placeholder="https://" onChange={(e) => set("url", e.target.value)} /></Row>
              <Row label={__("Email")}><Input type="email" value={kg.email} onChange={(e) => set("email", e.target.value)} /></Row>
              <Row label={__("Điện thoại")}><Input value={kg.phone} placeholder="+84 28 1234 5678" onChange={(e) => set("phone", e.target.value)} /></Row>
              {kg.type === "organization" && <Row label={__("Ngày thành lập")}><Input type="date" value={kg.foundingDate} onChange={(e) => set("foundingDate", e.target.value)} /></Row>}
              <Hint>{__("Trang mạng xã hội của tổ chức khai báo ở Tiêu đề & Meta › Mạng xã hội.")}</Hint>
            </>)}

            {tab === "local" && (<>
              {!s.modules?.localSeo && <Hint tone="warn">{__("Bật module Local SEO ở Bảng điều khiển SEO để đưa thông tin này vào schema.")}</Hint>}
              {kg.type === "person" && <Hint tone="warn">{__("Local SEO chỉ áp dụng khi website đại diện cho tổ chức.")}</Hint>}
              <Row label={__("Loại hình")}><Select value={kg.businessType} onChange={(e) => set("businessType", e.target.value)} options={BUSINESS_TYPES().map((b) => ({ value: b.value, label: __(b.label) }))} /></Row>
              <Row label={__("Địa chỉ")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Input value={kg.address.street} placeholder={__("Số nhà, đường")} onChange={(e) => set("address.street", e.target.value)} />
                  <div className="ecx-grid-2">
                    <Input value={kg.address.locality} placeholder={__("Quận/huyện, thành phố")} onChange={(e) => set("address.locality", e.target.value)} />
                    <Input value={kg.address.region} placeholder={__("Tỉnh/thành")} onChange={(e) => set("address.region", e.target.value)} />
                    <Input value={kg.address.postalCode} placeholder={__("Mã bưu chính")} onChange={(e) => set("address.postalCode", e.target.value)} />
                    <Input value={kg.address.country} placeholder="VN" maxLength={2} onChange={(e) => set("address.country", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </Row>
              <Row label={__("Toạ độ")} help={__("Lấy từ Google Maps: nhấp chuột phải vào vị trí → sao chép toạ độ.")}>
                <div className="ecx-flex">
                  <Input style={{ width: 160 }} value={kg.geo.lat} placeholder={__("Vĩ độ")} onChange={(e) => set("geo.lat", e.target.value.trim())} />
                  <Input style={{ width: 160 }} value={kg.geo.lng} placeholder={__("Kinh độ")} onChange={(e) => set("geo.lng", e.target.value.trim())}
                    onPaste={(e) => { const m = e.clipboardData.getData("text").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if (m) { e.preventDefault(); set("geo", { lat: m[1], lng: m[2] }); } }} />
                </div>
              </Row>
              <Row label={__("Giờ mở cửa")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  {(kg.openingHours ?? []).map((h, i) => (
                    <div key={i} className="ecx-flex">
                      {DAYS.map(([d, label]) => (
                        <button key={d} type="button" className={`ecx-chip${h.days.includes(d) ? " on" : ""}`} aria-pressed={h.days.includes(d)}
                          onClick={() => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] } : x)))}>{__(label)}</button>
                      ))}
                      <Input type="time" style={{ width: 120 }} value={h.opens} onChange={(e) => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))} />
                      <span className="ecx-muted">–</span>
                      <Input type="time" style={{ width: 120 }} value={h.closes} onChange={(e) => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))} />
                      <Button size="sm" variant="ghost" onClick={() => set("openingHours", kg.openingHours.filter((_, j) => j !== i))} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
                    </div>
                  ))}
                  <div><Button size="sm" variant="secondary" onClick={() => set("openingHours", [...(kg.openingHours ?? []), { days: ["Mo", "Tu", "We", "Th", "Fr"], opens: "08:00", closes: "17:30" }])}>{Icon.plus(14)} {__("Thêm khung giờ")}</Button></div>
                </div>
              </Row>
              <Row label={__("Mức giá")} help={__("Vd $$ hoặc 100.000–500.000 ₫")}><Input style={{ width: 220 }} value={kg.priceRange} onChange={(e) => set("priceRange", e.target.value)} /></Row>
            </>)}

            {tab === "templates" && (<>
              <Hint>{__("Mẫu schema tự thêm vào các bài khớp điều kiện — vd Product cho mọi bài trong chuyên mục Sản phẩm. Từng bài vẫn có thể thêm schema riêng trong hộp SEO.")}</Hint>
              {templates.length === 0 && <p className="ecx-muted">{__("Chưa có mẫu nào.")}</p>}
              {templates.map((t) => (
                <div key={t.id} className="ecx-schema-item">
                  <strong style={{ fontSize: 13 }}>{t.name}</strong>
                  <span className="ecx-muted">{__(schemaDef(t.type)?.label ?? t.type)}</span>
                  <span className="ecx-muted">· {t.conditions?.length ? __("{0} điều kiện", t.conditions.length) : __("chưa áp dụng")}</span>
                  <span className="ecx-spacer" />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(t))}>{__("Sửa")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => st.patch(["schema", "templates"], templates.filter((x) => x.id !== t.id))} aria-label={__("Xoá")}>{Icon.trash(14)}</Button>
                </div>
              ))}
              <div style={{ marginTop: 10 }}><Button variant="secondary" onClick={() => setPicking(true)}>{Icon.plus(14)} {__("Thêm mẫu")}</Button></div>
            </>)}
          </Card>
        </SettingsShell>
      )}
      <Modal open={picking} title={__("Chọn loại schema")} onClose={() => setPicking(false)} width={720}>
        <SchemaCatalog onPick={(type) => { setPicking(false); setEditing({ id: newId(), name: __(schemaDef(type)?.label ?? type), type, data: structuredClone(schemaDef(type)?.defaults ?? {}), conditions: [{ kind: "postType", value: "post" }] }); }} />
      </Modal>
      {editing && <TemplateEditor value={editing} onChange={saveTemplate} onClose={() => setEditing(null)} />}
    </>
  );
}
