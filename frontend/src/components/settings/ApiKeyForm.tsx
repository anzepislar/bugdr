"use client";

import { useState, type FormEvent } from "react";
import { ErrorMessage, FieldLabel, inputClass, primaryButton, secondaryButton, Spinner } from "@/components/admin/problems/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { api, ApiError } from "@/lib/api";

export type AiProvider = "anthropic" | "openai";

/** GET /me/api-key/status (S6). Never contains the key. */
export interface ApiKeyStatus {
  connected: boolean;
  provider: AiProvider | null;
  model: string | null;
  models: Record<AiProvider, string[]>;
}

const PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: "Anthropic", openai: "OpenAI" };
const fieldClass = `${inputClass} py-2.5`;

const errorText = (err: unknown) => {
  if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.details)
    return Object.values(err.details as Record<string, string>).join(". ");
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
};

// Account tab: the user's own Anthropic / OpenAI key for the built-in AI chat (S6, D63).
export function ApiKeyForm({ initial }: { initial: ApiKeyStatus }) {
  const [status, setStatus] = useState(initial);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState(initial.models.anthropic[0]);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function connect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/me/api-key", { method: "POST", body: JSON.stringify({ provider, key, model }) });
      setStatus((s) => ({ ...s, connected: true, provider, model }));
      setKey("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api("/me/api-key", { method: "DELETE" });
      setStatus((s) => ({ ...s, connected: false, provider: null, model: null }));
      setConfirmRemove(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ai-key-heading" className="mt-8 lg:max-w-xl">
      <h2 id="ai-key-heading" className="text-xl font-semibold text-text">
        AI model
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Connect your API key to use a more powerful AI and improve your efficiency score. Without a key the AI chat uses
        the free model with a daily limit.
      </p>

      {status.connected && status.provider ? (
        <div className="mt-6 flex flex-col gap-4 rounded border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-passed">
              <Icon name="check" className="h-4 w-4" /> Connected
            </p>
            <p className="mt-1 truncate text-sm text-text">
              {PROVIDER_LABEL[status.provider]} · {status.model}
            </p>
          </div>
          <button type="button" onClick={() => setConfirmRemove(true)} className={`${secondaryButton} sm:w-fit`}>
            Remove key
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="mt-6 flex flex-col gap-6">
          <div>
            <FieldLabel htmlFor="aiProvider">Provider</FieldLabel>
            <Select
              id="aiProvider"
              value={provider}
              onChange={(p) => {
                setProvider(p);
                setModel(status.models[p][0]);
              }}
              options={(Object.keys(PROVIDER_LABEL) as AiProvider[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="aiKey">API key</FieldLabel>
            <input
              id="aiKey"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className={fieldClass}
            />
            <p className="mt-1.5 text-xs text-muted">
              Stored encrypted and used only for your prompts on Bugdr. Usage is billed to your {PROVIDER_LABEL[provider]}{" "}
              account.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="aiModel">Model</FieldLabel>
            <Select
              id="aiModel"
              value={model}
              onChange={setModel}
              options={status.models[provider].map((m) => ({ value: m, label: m }))}
              className={fieldClass}
            />
          </div>
          <button type="submit" disabled={busy || !key.trim()} className={`${primaryButton} w-full px-6 py-2.5 sm:w-fit sm:min-w-44`}>
            {busy ? (
              <>
                <Spinner /> Checking key...
              </>
            ) : (
              "Connect key"
            )}
          </button>
        </form>
      )}
      {error && !confirmRemove ? <ErrorMessage>{error}</ErrorMessage> : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your API key?"
        message="The AI chat goes back to the free model with a daily limit. You can connect a key again at any time."
        confirmLabel="Remove key"
        busy={busy}
        error={confirmRemove ? error : ""}
        onConfirm={() => void remove()}
        onCancel={() => {
          setConfirmRemove(false);
          setError("");
        }}
      />
    </section>
  );
}
