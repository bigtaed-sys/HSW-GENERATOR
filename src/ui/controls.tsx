import { useEffect, useState, type ReactNode } from 'react';
import { PALETTE } from '../model/defaults';
import { useStore } from '../model/store';
import type { Lang, Project } from '../model/types';
import type { ParamDef } from '../geometry/params';

/** Binds a numeric project field to a slider: live preview while dragging, one undo step per gesture. */
export function useBind() {
  const update = useStore((s) => s.update);
  return (fn: (p: Project, v: number) => void) => (v: number, transient?: boolean) =>
    update((p) => fn(p, v), { transient });
}

export function Section({ title, children, action }: { title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section">
      {title && (
        <h3 className="section-title">
          <span>{title}</span>
          {action}
        </h3>
      )}
      {children}
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export function NumberInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [text, setText] = useState(value.toFixed(decimals(step)));
  useEffect(() => setText(value.toFixed(decimals(step))), [value, step]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(clamp(v, min, max));
    else setText(value.toFixed(decimals(step)));
  };
  return (
    <label className="num">
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onCommit(clamp(+(value + d).toFixed(4), min, max));
          }
        }}
      />
      {unit && <span>{unit}</span>}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'mm',
  onChange,
  inputMin,
  inputMax,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number, transient?: boolean) => void;
  /** Allow typing values beyond the slider range. */
  inputMin?: number;
  inputMax?: number;
}) {
  const checkpoint = useStore((s) => s.checkpoint);
  const p = ((clamp(value, min, max) - min) / (max - min || 1)) * 100;
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
      </div>
      <div className="field-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(value, min, max)}
          style={{ ['--p' as string]: `${p}%` }}
          onPointerDown={checkpoint}
          onChange={(e) => onChange(+e.target.value, true)}
          onPointerUp={(e) => onChange(+(e.target as HTMLInputElement).value)}
          onKeyUp={(e) => onChange(+(e.target as HTMLInputElement).value)}
        />
        <NumberInput
          value={value}
          min={inputMin ?? min}
          max={inputMax ?? max}
          step={step}
          unit={unit}
          onCommit={(v) => onChange(v)}
        />
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full = true,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`seg ${full ? 'full' : ''}`}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

export function Swatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = !PALETTE.includes(value.toLowerCase());
  return (
    <div className="swatches">
      {PALETTE.map((c) => (
        <button
          key={c}
          className={`swatch ${c === value.toLowerCase() ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <label className={`swatch swatch-input ${custom ? 'on' : ''}`} style={custom ? { background: value } : undefined}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** Slider or segmented choice for a catalogue parameter. */
export function ParamControl({
  def,
  value,
  lang,
  onChange,
}: {
  def: ParamDef;
  value: number;
  lang: Lang;
  onChange: (v: number, transient?: boolean) => void;
}) {
  if (def.options)
    return (
      <div className="field">
        <div className="field-head">
          <span>{def.label[lang]}</span>
        </div>
        <Segmented
          value={String(value)}
          onChange={(v) => onChange(Number(v))}
          options={def.options.map((o) => ({ value: String(o.value), label: o.label[lang] }))}
        />
      </div>
    );
  return (
    <Slider label={def.label[lang]} value={value} min={def.min} max={def.max} step={def.step} unit={def.unit} onChange={onChange} />
  );
}
