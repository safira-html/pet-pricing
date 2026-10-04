import type { BaseDados, Perfil } from "./types";

/**
 * Cliente da API (api/server). Sem NEXT_PUBLIC_API_URL o front roda sozinho,
 * com as bases embutidas e o estado só no navegador.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const apiEnabled = API_URL.length > 0;

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = (await response.json()).detail;
    } catch {
      /* corpo vazio */
    }
    const message = typeof detail === "string" ? detail : typeof detail === "object" && detail && "message" in detail ? String((detail as { message: unknown }).message) : `Erro ${response.status}`;
    throw new ApiError(response.status, message, detail);
  }
  return response.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface ExplainResult {
  text: string;
  source: "llm" | "deterministic";
  reason: string | null;
}

export const api = {
  health: () => call<{ status: string; engine_version: string; llm: boolean }>("/api/health"),
  base: (scenario: "oficial" | "sintetico") => call<BaseDados>(`/api/bases/${scenario}`),
  createSession: () => call<{ session_id: string }>("/api/sessions", { method: "POST" }),
  session: (id: string) => call<{ session_id: string; has_upload: boolean }>(`/api/sessions/${id}`),
  getState: (id: string) => call<{ version: number; state: unknown | null }>(`/api/sessions/${id}/state`),
  putState: (id: string, version: number, state: unknown) => call<{ version: number }>(`/api/sessions/${id}/state`, json("PUT", { version, state })),
  postEvent: (id: string, e: { author: string; profile: Perfil | "sistema"; kind: string; text: string; rec_id?: string | null }) =>
    call<unknown>(`/api/sessions/${id}/events`, json("POST", e)),
  verifyEvents: (id: string) => call<{ valid: boolean; events: number; broken_at: number | null }>(`/api/sessions/${id}/events/verify`),
  upload: (id: string) => call<BaseDados>(`/api/sessions/${id}/upload`),
  sendUpload: (id: string, file: File, profile: Perfil) => {
    const form = new FormData();
    form.append("file", file);
    return call<BaseDados & { avisos_importacao?: unknown[] }>(`/api/sessions/${id}/upload`, { method: "POST", body: form, headers: { "X-Profile": profile } });
  },
  explain: (body: { product: string; channel: string; action: string; facts: string[] }) => call<ExplainResult>("/api/explain", json("POST", body)),
};
