const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const moeda = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));
export const inteiro = (v: number | null | undefined) => (v == null ? "—" : num.format(v));

export function pct(v: number | null | undefined, casas = 1, sinal = false) {
  if (v == null || Number.isNaN(v)) return "—";
  const s = (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${sinal && v > 0 ? "+" : ""}${s}%`;
}

export function pp(v: number | null | undefined) {
  if (v == null) return "—";
  const s = (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : ""}${s} p.p.`;
}

export function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function dataHoraBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function mesCurto(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}
