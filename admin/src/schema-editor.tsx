import { useState } from "react";
import { Button, Field, Input, Modal, Select, Textarea } from "@ecomcx/ecomweb-admin-sdk";
import { SCHEMA_TYPES, schemaDef, type SchemaField } from "../../frontend/lib/schema-types";
import { Icon, ImageField } from "./ui";
import { t } from "./i18n";

export interface SchemaEntry { id: string; type: string; data: Record<string, any> }

export const newId = () => Math.random().toString(36).slice(2, 10);

/** "PT1H30M" ⇄ giờ + phút. */
function DurationInput({ value, onChange }: { value?: string; onChange(v: string): void }) {
  const m = (value ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  const h = m?.[1] ?? "", min = m?.[2] ?? "";
  const set = (hh: string, mm: string) => onChange(hh || mm ? `PT${hh ? `${Number(hh)}H` : ""}${mm ? `${Number(mm)}M` : ""}` : "");
  return (
    <div className="ecx-flex">
      <Input type="number" min={0} style={{ width: 90 }} value={h} onChange={(e) => set(e.target.value, min)} /> <span className="ecx-muted">{t("schemaEditor.hours")}</span>
      <Input type="number" min={0} max={59} style={{ width: 90 }} value={min} onChange={(e) => set(h, e.target.value)} /> <span className="ecx-muted">{t("schemaEditor.minutes")}</span>
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: SchemaField; value: any; onChange(v: any): void }) {
  switch (f.type) {
    case "textarea": return <Textarea rows={3} value={value ?? ""} placeholder={f.placeholder && t(f.placeholder)} onChange={(e) => onChange(e.target.value)} />;
    case "number": return <Input type="number" step="any" value={value ?? ""} placeholder={f.placeholder && t(f.placeholder)} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
    case "date": return <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "datetime": return <Input type="datetime-local" value={(value ?? "").slice(0, 16)} onChange={(e) => onChange(e.target.value)} />;
    case "url": return <Input type="url" value={value ?? ""} placeholder={f.placeholder ? t(f.placeholder) : "https://"} onChange={(e) => onChange(e.target.value)} />;
    case "select": return <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)} options={(f.options ?? []).map((o) => ({ value: o.value, label: t(o.label) }))} />;
    case "image": return <ImageField value={typeof value === "string" ? { url: value } : value} onChange={(v) => onChange(v)} />;
    case "duration": return <DurationInput value={value} onChange={onChange} />;
    case "strings": {
      const list: string[] = Array.isArray(value) && value.length ? value : [""];
      return (
        <div className="ecx-grid">
          {list.map((item, i) => (
            <div key={i} className="ecx-flex">
              <Input style={{ flex: 1 }} value={item} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button size="sm" variant="ghost" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
            </div>
          ))}
          <div><Button size="sm" variant="secondary" onClick={() => onChange([...list, ""])}>{Icon.plus(14)} {t("schemaEditor.add_row")}</Button></div>
        </div>
      );
    }
    case "list": {
      const items: any[] = Array.isArray(value) ? value : [];
      return (
        <div>
          {items.map((item, i) => (
            <div key={i} className="ecx-list-item">
              <div className="ecx-flex"><strong style={{ fontSize: 12.5 }}>#{i + 1}</strong><span className="ecx-spacer" />
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}>↑</Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
              </div>
              {(f.fields ?? []).map((sub) => (
                <Field key={sub.key} label={t(sub.label) + (sub.required ? " *" : "")}>
                  <FieldInput f={sub} value={item?.[sub.key]} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [sub.key]: v } : x)))} />
                </Field>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => onChange([...items, {}])}>{Icon.plus(14)} {t("schemaEditor.add")}</Button></div>
        </div>
      );
    }
    case "json": {
      let error = "";
      try { if (value) JSON.parse(value); } catch (e) { error = (e as Error).message; }
      return <div><Textarea className="ecx-json" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />{error && <div className="ecx-muted" style={{ color: "var(--app-danger)" }}>{t("schemaEditor.invalid_json", { error })}</div>}</div>;
    }
    default: return <Input value={value ?? ""} placeholder={f.placeholder && t(f.placeholder)} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function SchemaForm({ entry, onChange }: { entry: SchemaEntry; onChange(e: SchemaEntry): void }) {
  const def = schemaDef(entry.type);
  if (!def) return null;
  return (
    <div className="ecx-grid">
      <p className="ecx-muted" style={{ margin: 0 }}>{t(def.description)}. {t("schemaEditor.you_can_use_variables_such")}</p>
      {def.fields.map((f) => (
        <Field key={f.key} label={t(f.label) + (f.required ? " *" : "")} help={f.help ? t(f.help) : undefined}>
          <FieldInput f={f} value={entry.data[f.key]} onChange={(v) => onChange({ ...entry, data: { ...entry.data, [f.key]: v } })} />
        </Field>
      ))}
    </div>
  );
}

export function SchemaCatalog({ onPick, exclude = [] }: { onPick(type: string): void; exclude?: string[] }) {
  return (
    <div className="ecx-schema-catalog">
      {SCHEMA_TYPES.filter((schemaTypeDef) => !exclude.includes(schemaTypeDef.type)).map((schemaTypeDef) => (
        <button key={schemaTypeDef.type} type="button" onClick={() => onPick(schemaTypeDef.type)}><strong>{t(schemaTypeDef.label)}</strong><span>{t(schemaTypeDef.description)}</span></button>
      ))}
    </div>
  );
}

/** Danh sách schema + thêm/sửa/xoá (dùng cho từng bài). */
export function SchemaList({ value, onChange }: { value: SchemaEntry[]; onChange(v: SchemaEntry[]): void }) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<SchemaEntry | null>(null);
  const save = () => {
    if (!editing) return;
    onChange(value.some((x) => x.id === editing.id) ? value.map((x) => (x.id === editing.id ? editing : x)) : [...value, editing]);
    setEditing(null);
  };
  return (
    <div>
      {value.map((s) => (
        <div key={s.id} className="ecx-schema-item">
          <strong style={{ fontSize: 13 }}>{t(schemaDef(s.type)?.label ?? s.type)}</strong>
          <span className="ecx-muted ecx-trunc" style={{ maxWidth: 260 }}>{String(s.data.name ?? s.data.headline ?? s.data.title ?? "")}</span>
          <span className="ecx-spacer" />
          <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(s))}>{t("common.edit")}</Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((x) => x.id !== s.id))} aria-label={t("common.delete")}>{Icon.trash(14)}</Button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}><Button variant="secondary" onClick={() => setPicking(true)}>{Icon.plus(14)} {t("schemaEditor.add_schema")}</Button></div>
      <Modal open={picking} title={t("schemaEditor.choose_a_schema_type")} onClose={() => setPicking(false)} width={720}>
        <SchemaCatalog onPick={(type) => { setPicking(false); setEditing({ id: newId(), type, data: structuredClone(schemaDef(type)?.defaults ?? {}) }); }} />
      </Modal>
      <Modal open={!!editing} width={720} title={editing ? t(schemaDef(editing.type)?.label ?? editing.type) : ""} onClose={() => setEditing(null)}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={save}>{t("schemaEditor.save_schema")}</Button></>}>
        {editing && <SchemaForm entry={editing} onChange={setEditing} />}
      </Modal>
    </div>
  );
}
