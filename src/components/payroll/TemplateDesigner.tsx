import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYSLIP_FIELDS, FieldPlacement } from "@/lib/payslipFields";
import { Trash2, Plus, Move } from "lucide-react";

interface Props {
  backgroundUrl: string;
  previewUrl?: string | null;
  width: number;
  height: number;
  fields: FieldPlacement[];
  onChange: (fields: FieldPlacement[]) => void;
}

export function TemplateDesigner({ backgroundUrl, previewUrl, width, height, fields, onChange }: Props) {
  const displayUrl = previewUrl || backgroundUrl;
  const [selected, setSelected] = useState<number | null>(null);
  const [newKey, setNewKey] = useState<string>(PAYSLIP_FIELDS[0].key);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ idx: number; offsetX: number; offsetY: number } | null>(null);

  const addField = () => {
    const f = PAYSLIP_FIELDS.find((p) => p.key === newKey)!;
    const next: FieldPlacement = {
      key: f.key,
      label: f.label,
      x: 0.1,
      y: 0.1 + fields.length * 0.04,
      fontSize: 14,
      align: "left",
      format: f.format,
    };
    onChange([...fields, next]);
    setSelected(fields.length);
  };

  const updateField = (i: number, patch: Partial<FieldPlacement>) => {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };

  const removeField = (i: number) => {
    onChange(fields.filter((_, idx) => idx !== i));
    setSelected(null);
  };

  const onMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setSelected(idx);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    draggingRef.current = { idx, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left - draggingRef.current.offsetX) / r.width;
    const y = (e.clientY - r.top - draggingRef.current.offsetY) / r.height;
    updateField(draggingRef.current.idx, {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    });
  };

  const onMouseUp = () => { draggingRef.current = null; };

  const aspect = height / width;
  const sel = selected !== null ? fields[selected] : null;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      {/* Canvas */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Drag labels to position them on the template.</p>
        <div
          ref={containerRef}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="relative w-full border rounded overflow-hidden bg-muted select-none"
          style={{ paddingBottom: `${aspect * 100}%` }}
        >
          <img src={displayUrl} alt="template" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
          {fields.map((f, i) => (
            <div
              key={i}
              onMouseDown={(e) => onMouseDown(e, i)}
              className={`absolute cursor-move px-1.5 py-0.5 rounded text-xs whitespace-nowrap ${
                selected === i ? "bg-primary text-primary-foreground ring-2 ring-accent" : "bg-background/90 border border-primary/50"
              }`}
              style={{
                left: `${f.x * 100}%`,
                top: `${f.y * 100}%`,
                fontSize: 11,
                fontWeight: f.bold ? 700 : 500,
              }}
            >
              <Move className="w-3 h-3 inline mr-1" />
              {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="border rounded p-3 space-y-2">
          <Label>Add field</Label>
          <div className="flex gap-2">
            <Select value={newKey} onValueChange={setNewKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYSLIP_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" onClick={addField}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        {sel && selected !== null ? (
          <div className="border rounded p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{sel.label}</p>
              <Button size="icon" variant="ghost" onClick={() => removeField(selected)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">X (%)</Label>
                <Input type="number" min={0} max={100} value={Math.round(sel.x * 100)}
                  onChange={(e) => updateField(selected, { x: Number(e.target.value) / 100 })} />
              </div>
              <div>
                <Label className="text-xs">Y (%)</Label>
                <Input type="number" min={0} max={100} value={Math.round(sel.y * 100)}
                  onChange={(e) => updateField(selected, { y: Number(e.target.value) / 100 })} />
              </div>
              <div>
                <Label className="text-xs">Font size</Label>
                <Input type="number" min={6} max={48} value={sel.fontSize}
                  onChange={(e) => updateField(selected, { fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Align</Label>
                <Select value={sel.align} onValueChange={(v: any) => updateField(selected, { align: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!sel.bold}
                onChange={(e) => updateField(selected, { bold: e.target.checked })} />
              Bold
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Click a field to edit it.</p>
        )}
      </div>
    </div>
  );
}
