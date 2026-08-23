import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, LoaderCircle, Music2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_ANALYZER_URL || "http://127.0.0.1:8765";

type AnalysisResponse = {
  job_id: string;
  analysis: { bpm?: number; key?: string; mode?: string; camelot?: string; duration?: number; confidence?: number };
  stems: { ok?: boolean; error?: string; files?: Record<string, string> };
  midi?: Record<string, { ok?: boolean; midi?: string; error?: string }>;
  dna: Record<string, unknown>;
  dna_url?: string;
};

function assetUrl(path?: string) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${API}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function AnalyzerLab({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Comprobando motor local…");
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [separate, setSeparate] = useState(true);
  const [midi, setMidi] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((d) => {
        setModules(d.modules || {});
        setStatus(d.modules?.demucs ? "Motor local listo." : "Analizador listo · Demucs pendiente.");
      })
      .catch(() => setStatus("ADN Lab no está iniciado. Ejecuta run-beatris.command."));
  }, []);

  const stemEntries = useMemo(() => ["drums", "bass", "other", "vocals"].map((n) => [n, result?.stems?.files?.[n]] as const), [result]);

  async function analyze() {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    setStatus("Analizando BPM, tonalidad y Camelot… Demucs puede tardar varios minutos en CPU.");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(`${API}/api/analyze?separate=${separate}&midi=${midi}`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "No se pudo analizar el audio.");
      setResult(d);
      localStorage.setItem("beatris:last-dna", JSON.stringify(d.dna));
      setStatus("ADN generado y guardado como perfil local de Beatris.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error de análisis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-bg text-fg">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <button type="button" onClick={onClose} className="mb-8 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> volver a Beatris
        </button>

        <div className="grid items-end gap-6 md:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">Beatris / ADN Lab</div>
            <h2 className="max-w-4xl font-display text-5xl leading-[0.88] tracking-tight md:text-7xl">Convierte canciones en ADN musical.</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted">BPM, tonalidad, Camelot y stems para alimentar el motor generativo sin convertir el pozo en un simple reproductor.</p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-5 md:p-7">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-5 text-center hover:border-accent">
            <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Upload className="mb-3 size-7 text-muted" />
            <span className="font-display text-xl">{file?.name || "ARRASTRA O SELECCIONA UNA CANCIÓN"}</span>
            <span className="mt-1 text-xs text-muted">MP3 · WAV · FLAC · M4A</span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Toggle label="SEPARAR STEMS" checked={separate} onChange={setSeparate} ready={modules.demucs !== false} />
            <Toggle label="EXTRAER MIDI" checked={midi} onChange={setMidi} ready={modules.basic_pitch === true} />
          </div>

          <button type="button" disabled={!file || busy} onClick={analyze} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent font-display text-base tracking-wide text-accent-fg disabled:opacity-40">
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Music2 className="size-5" />}
            {busy ? "ANALIZANDO ADN…" : "ANALIZAR ADN"}
          </button>
          <p className={cn("mt-3 font-mono text-[11px] leading-relaxed", status.includes("Error") || status.includes("no está") ? "text-signal" : "text-muted")}>{status}</p>
        </section>

        {result && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric value={result.analysis.bpm ? `${result.analysis.bpm}` : "—"} label="BPM" />
              <Metric value={`${result.analysis.key || "—"}${result.analysis.mode ? result.analysis.mode === "major" ? " Maj" : " min" : ""}`} label="TONALIDAD" />
              <Metric value={result.analysis.camelot || "—"} label="CAMELOT" />
              <Metric value={result.analysis.duration ? `${result.analysis.duration}s` : "—"} label="DURACIÓN" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-display text-xl">STEMS</h3>
                <div className="mt-3 divide-y divide-border">
                  {stemEntries.map(([name, path]) => (
                    <div key={name} className="flex items-center justify-between gap-3 py-3">
                      <span className="uppercase">{name}</span>
                      {path ? <audio controls preload="none" className="h-8 w-48" src={assetUrl(path)} /> : <span className="max-w-64 text-right font-mono text-[10px] text-muted">{result.stems.error || "no disponible"}</span>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-display text-xl">ADN ACTIVO</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">Este análisis ya quedó guardado localmente. En la siguiente capa, Beatris utilizará sus patrones candidatos para bajo, hook y groove.</p>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-bg p-3 font-mono text-xs text-accent"><Check className="size-4" /> perfil guardado</div>
                {result.dna_url && <a href={assetUrl(result.dna_url)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-sm text-cyan-300">abrir DNA JSON <ExternalLink className="size-4" /></a>}
              </section>
            </div>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="font-display text-xl">TETRISHOUSE DNA</h3>
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-bg p-4 font-mono text-[11px] leading-relaxed text-muted">{JSON.stringify(result.dna, null, 2)}</pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, ready }: { label: string; checked: boolean; onChange: (v: boolean) => void; ready: boolean }) {
  return <label className={cn("flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-2 text-xs", !ready && "opacity-50")}><input type="checkbox" checked={checked} disabled={!ready} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />{label}</label>;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><div className="font-display text-3xl leading-none">{value}</div><div className="mt-2 font-mono text-[9px] tracking-[0.18em] text-muted">{label}</div></div>;
}
