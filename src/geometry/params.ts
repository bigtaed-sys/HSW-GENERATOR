// Shared description of user-tunable numeric parameters (accessories, frame styles, …).

export type Text = { ru: string; en: string };

export interface ParamDef {
  key: string;
  label: Text;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
  /** When set, the value is one of these and is shown as a segmented choice. */
  options?: { value: number; label: Text }[];
}

export const param = (
  key: string,
  ru: string,
  en: string,
  min: number,
  max: number,
  def: number,
  step = 1,
  unit = 'mm',
): ParamDef => ({ key, label: { ru, en }, min, max, def, step, unit });

export const defaultsOf = (params: ParamDef[]): Record<string, number> =>
  Object.fromEntries(params.map((p) => [p.key, p.def]));
