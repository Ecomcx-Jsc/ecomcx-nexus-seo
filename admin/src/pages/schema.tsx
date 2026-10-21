import { useState } from "react";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea, useApi } from "@cms/admin-sdk";
import { BUSINESS_TYPES, schemaDef } from "../../../frontend/lib/schema-types";
import type { SchemaTemplate } from "../../../frontend/lib/settings";
import { SchemaCatalog, SchemaForm, newId } from "../schema-editor";
import { Hint, Icon, ImageField, Loading, Row, SettingsShell, useContentTypes, useSeoSettings } from "../ui";
import { useHashTab } from "./titles";
import { t } from "../i18n";

const DAYS = [["Mo", "schema.day_mo"], ["Tu", "schema.day_tu"], ["We", "schema.day_we"], ["Th", "schema.day_th"], ["Fr", "schema.day_fr"], ["Sa", "schema.day_sa"], ["Su", "schema.day_su"]] as const;

function TemplateEditor({ value, onChange, onClose }: { value: SchemaTemplate; onChange(schemaTemplate: SchemaTemplate): void; onClose(): void }) {
  const [schemaTemplate, setT] = useState(value);
  const { postTypes } = useContentTypes();
  const { data: cats } = useApi<{ items: Array<{ id: number; name: string }> }>("/admin/terms/category?pageSize=1000");
  const conds = schemaTemplate.conditions ?? [];
  const setCond = (i: number, c: SchemaTemplate["conditions"][number]) => setT({ ...schemaTemplate, conditions: conds.map((x, j) => (j === i ? c : x)) });
  return (
    <Modal open width={760} title={t("schema.schema_template", { text: t(schemaDef(schemaTemplate.type)?.label ?? schemaTemplate.type) })} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" disabled={!schemaTemplate.name.trim()} onClick={() => onChange(schemaTemplate)}>{t("schema.save_template")}</Button></>}>
      <div className="ecx-grid">
        <Row label={t("schema.template_name")}><Input value={schemaTemplate.name} onChange={(e) => setT({ ...schemaTemplate, name: e.target.value })} /></Row>
        <Row label={t("schema.apply_to")} help={t("schema.the_template_is_added_to")}>
          <div className="ecx-grid" style={{ gap: 8 }}>
            {conds.map((c, i) => (
              <div key={i} className="ecx-flex" style={{ flexWrap: "nowrap" }}>
                <Select style={{ width: 170 }} value={c.kind} onChange={(e) => setCond(i, { kind: e.target.value as any, value: undefined })}
                  options={[{ value: "all", label: t("schema.all_posts") }, { value: "postType", label: t("common.content_types") }, { value: "term", label: t("schema.category") }]} />
                {c.kind === "postType" && <Select style={{ flex: 1 }} value={String(c.value ?? "")} onChange={(e) => setCond(i, { ...c, value: e.target.value })}
                  options={[{ value: "", label: "—" }, ...postTypes.map((p) => ({ value: p.name, label: p.label }))]} />}
                {c.kind === "term" && <Select style={{ flex: 1 }} value={String(c.value ?? "")} onChange={(e) => setCond(i, { ...c, value: Number(e.target.value) })}
                  options={[{ value: "", label: "—" }, ...(cats?.items ?? []).map((x) => ({ value: String(x.id), label: x.name }))]} />}
                <Button size="sm" variant="ghost" onClick={() => setT({ ...schemaTemplate, conditions: conds.filter((_, j) => j !== i) })} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
              </div>
            ))}
            <div><Button size="sm" variant="secondary" onClick={() => setT({ ...schemaTemplate, conditions: [...conds, { kind: "postType", value: "post" }] })}>{Icon.plus(14)} {t("schema.add_condition")}</Button></div>
          </div>
        </Row>
        <SchemaForm entry={schemaTemplate} onChange={(e) => setT({ ...schemaTemplate, data: e.data })} />
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
  const saveTemplate = (schemaTemplate: SchemaTemplate) => {
    st.patch(["schema", "templates"], templates.some((x) => x.id === schemaTemplate.id) ? templates.map((x) => (x.id === schemaTemplate.id ? schemaTemplate : x)) : [...templates, schemaTemplate]);
    setEditing(null);
  };
  const tabs = [{ value: "kg", label: t("schema.organization_person") }, { value: "local", label: "Local SEO" }, { value: "templates", label: t("schema.schema_templates") }];

  return (
    <>
      <PageHeader title={t("schema.schema")} description={t("schema.structured_data_json_ld_helps")} />
      {!s || !kg ? <Loading /> : (
        <SettingsShell tabs={tabs} tab={tab} onTab={setTab} dirty={st.dirty} saving={st.saving} onSave={st.save} onReset={st.reset}>
          {s.modules?.schema === false && <Hint tone="warn">{t("schema.the_schema_module_is_off")}</Hint>}
          <Card>
            {tab === "kg" && (<>
              <Row label={t("schema.this_website_represents")}>
                <Select value={kg.type} onChange={(e) => set("type", e.target.value)} options={[{ value: "organization", label: t("schema.an_organization_business") }, { value: "person", label: t("schema.a_person") }]} />
              </Row>
              <Row label={kg.type === "person" ? t("schema.full_name") : t("schema.organization_name")}><Input value={kg.name} onChange={(e) => set("name", e.target.value)} /></Row>
              <Row label={t("schema.alternate_name")} help={t("schema.abbreviation_or_trading_name")}><Input value={kg.alternateName} onChange={(e) => set("alternateName", e.target.value)} /></Row>
              <Row label={kg.type === "person" ? t("schema.profile_photo") : t("schema.logo")} help={t("schema.at_least_112_112px_transparent")}><ImageField value={kg.logo} onChange={(v) => set("logo", v)} /></Row>
              <Row label={t("common.description")}><Textarea rows={3} value={kg.description} onChange={(e) => set("description", e.target.value)} /></Row>
              <Row label="URL" help={t("schema.leave_empty_site_address")}><Input value={kg.url} placeholder="https://" onChange={(e) => set("url", e.target.value)} /></Row>
              <Row label={t("schema.email")}><Input type="email" value={kg.email} onChange={(e) => set("email", e.target.value)} /></Row>
              <Row label={t("schema.mobile")}><Input value={kg.phone} placeholder="+84 28 1234 5678" onChange={(e) => set("phone", e.target.value)} /></Row>
              {kg.type === "organization" && <Row label={t("schema.founding_date")}><Input type="date" value={kg.foundingDate} onChange={(e) => set("foundingDate", e.target.value)} /></Row>}
              <Hint>{t("schema.social_profiles_of_the_organization")}</Hint>
            </>)}

            {tab === "local" && (<>
              {!s.modules?.localSeo && <Hint tone="warn">{t("schema.turn_on_the_local_seo")}</Hint>}
              {kg.type === "person" && <Hint tone="warn">{t("schema.local_seo_only_applies_when")}</Hint>}
              <Row label={t("schema.business_type")}><Select value={kg.businessType} onChange={(e) => set("businessType", e.target.value)} options={BUSINESS_TYPES().map((b) => ({ value: b.value, label: t(b.label) }))} /></Row>
              <Row label={t("schema.address")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  <Input value={kg.address.street} placeholder={t("schema.street_address")} onChange={(e) => set("address.street", e.target.value)} />
                  <div className="ecx-grid-2">
                    <Input value={kg.address.locality} placeholder={t("schema.district_city")} onChange={(e) => set("address.locality", e.target.value)} />
                    <Input value={kg.address.region} placeholder={t("schema.state_province")} onChange={(e) => set("address.region", e.target.value)} />
                    <Input value={kg.address.postalCode} placeholder={t("schema.postal_code")} onChange={(e) => set("address.postalCode", e.target.value)} />
                    <Input value={kg.address.country} placeholder="VN" maxLength={2} onChange={(e) => set("address.country", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </Row>
              <Row label={t("schema.coordinates")} help={t("schema.from_google_maps_right_click")}>
                <div className="ecx-flex">
                  <Input style={{ width: 160 }} value={kg.geo.lat} placeholder={t("schema.latitude")} onChange={(e) => set("geo.lat", e.target.value.trim())} />
                  <Input style={{ width: 160 }} value={kg.geo.lng} placeholder={t("schema.longitude")} onChange={(e) => set("geo.lng", e.target.value.trim())}
                    onPaste={(e) => { const m = e.clipboardData.getData("text").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if (m) { e.preventDefault(); set("geo", { lat: m[1], lng: m[2] }); } }} />
                </div>
              </Row>
              <Row label={t("schema.opening_hours")}>
                <div className="ecx-grid" style={{ gap: 8 }}>
                  {(kg.openingHours ?? []).map((h, i) => (
                    <div key={i} className="ecx-flex">
                      {DAYS.map(([d, label]) => (
                        <button key={d} type="button" className={`ecx-chip${h.days.includes(d) ? " on" : ""}`} aria-pressed={h.days.includes(d)}
                          onClick={() => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] } : x)))}>{t(label)}</button>
                      ))}
                      <Input type="time" style={{ width: 120 }} value={h.opens} onChange={(e) => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))} />
                      <span className="ecx-muted">–</span>
                      <Input type="time" style={{ width: 120 }} value={h.closes} onChange={(e) => set("openingHours", kg.openingHours.map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))} />
                      <Button size="sm" variant="ghost" onClick={() => set("openingHours", kg.openingHours.filter((_, j) => j !== i))} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
                    </div>
                  ))}
                  <div><Button size="sm" variant="secondary" onClick={() => set("openingHours", [...(kg.openingHours ?? []), { days: ["Mo", "Tu", "We", "Th", "Fr"], opens: "08:00", closes: "17:30" }])}>{Icon.plus(14)} {t("schema.add_hours")}</Button></div>
                </div>
              </Row>
              <Row label={t("schema.price_range")} help={t("schema.e_g_or_100_000")}><Input style={{ width: 220 }} value={kg.priceRange} onChange={(e) => set("priceRange", e.target.value)} /></Row>
            </>)}

            {tab === "templates" && (<>
              <Hint>{t("schema.schema_templates_are_added_to")}</Hint>
              {templates.length === 0 && <p className="ecx-muted">{t("schema.no_templates_yet")}</p>}
              {templates.map((schemaTemplate) => (
                <div key={schemaTemplate.id} className="ecx-schema-item">
                  <strong style={{ fontSize: 13 }}>{schemaTemplate.name}</strong>
                  <span className="ecx-muted">{t(schemaDef(schemaTemplate.type)?.label ?? schemaTemplate.type)}</span>
                  <span className="ecx-muted">· {schemaTemplate.conditions?.length ? t("schema.conditions", { count: schemaTemplate.conditions.length }) : t("schema.not_applied")}</span>
                  <span className="ecx-spacer" />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(schemaTemplate))}>{t("common.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => st.patch(["schema", "templates"], templates.filter((x) => x.id !== schemaTemplate.id))} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
                </div>
              ))}
              <div style={{ marginTop: 10 }}><Button variant="secondary" onClick={() => setPicking(true)}>{Icon.plus(14)} {t("schema.add_template")}</Button></div>
            </>)}
          </Card>
        </SettingsShell>
      )}
      <Modal open={picking} title={t("schema.choose_a_schema_type")} onClose={() => setPicking(false)} width={720}>
        <SchemaCatalog onPick={(type) => { setPicking(false); setEditing({ id: newId(), name: t(schemaDef(type)?.label ?? type), type, data: structuredClone(schemaDef(type)?.defaults ?? {}), conditions: [{ kind: "postType", value: "post" }] }); }} />
      </Modal>
      {editing && <TemplateEditor value={editing} onChange={saveTemplate} onClose={() => setEditing(null)} />}
    </>
  );
}
