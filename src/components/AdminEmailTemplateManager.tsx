"use client";

import { useEffect, useMemo, useState } from "react";

type Template = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: string;
};

type UiState = {
  type: "idle" | "error" | "success";
  message?: string;
};

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") {
      return err;
    }
  }
  return fallback;
}

export function AdminEmailTemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<UiState>({ type: "idle" });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === selectedKey) ?? null,
    [templates, selectedKey]
  );

  useEffect(() => {
    async function loadTemplates() {
      setLoading(true);
      setState({ type: "idle" });
      try {
        const response = await fetch("/api/admin/email-templates", { cache: "no-store" });
        const data = (await response.json()) as { templates?: Template[]; error?: unknown };
        if (!response.ok) {
          setState({ type: "error", message: errorMessage(data, "Could not load templates.") });
          return;
        }

        const list = data.templates ?? [];
        setTemplates(list);
        if (list.length > 0) {
          setSelectedKey(list[0].key);
          setSubjectTemplate(list[0].subjectTemplate);
          setBodyTemplate(list[0].bodyTemplate);
        }
      } catch (error) {
        console.error(error);
        setState({ type: "error", message: "Could not load templates." });
      } finally {
        setLoading(false);
      }
    }

    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    setSubjectTemplate(selectedTemplate.subjectTemplate);
    setBodyTemplate(selectedTemplate.bodyTemplate);
  }, [selectedTemplate]);

  async function saveTemplate() {
    if (!selectedTemplate) {
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/admin/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedTemplate.key,
          subjectTemplate,
          bodyTemplate
        })
      });
      const data = (await response.json()) as { template?: Template; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save template.") });
        return;
      }

      if (data.template) {
        const nextTemplate = data.template;
        setTemplates((current) =>
          current.map((template) => (template.key === nextTemplate.key ? nextTemplate : template))
        );
      }
      setState({ type: "success", message: `Saved ${selectedTemplate.name}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save template." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading email templates...</p>;
  }

  if (!selectedTemplate) {
    return <p className="lead">No templates configured.</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h2>Email Template</h2>
        <div className="field">
          <label htmlFor="template-key">Template</label>
          <select id="template-key" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
          {selectedTemplate.description ? <p className="lead">{selectedTemplate.description}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="template-subject">Subject Template</label>
          <input
            id="template-subject"
            value={subjectTemplate}
            onChange={(event) => setSubjectTemplate(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="template-body">Body Template</label>
          <textarea
            id="template-body"
            value={bodyTemplate}
            onChange={(event) => setBodyTemplate(event.target.value)}
            rows={12}
          />
        </div>

        <div className="action-row">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveTemplate()}>
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </article>

      <article className="card grid">
        <h3>Supported Placeholders</h3>
        <p className="lead">
          {"{{BOOKING_REFERENCE}}"}, {"{{START_DATE}}"}, {"{{END_DATE}}"}, {"{{TOTAL_GUESTS}}"},
          {"{{PET_COUNT}}"}, {"{{CURRENCY}}"}, {"{{TOTAL_AMOUNT}}"}, {"{{SOURCE}}"},
          {"{{SCOPE}}"}, {"{{REJECTION_REASON}}"}, {"{{MANAGE_URL}}"}, {"{{ADMIN_BOOKINGS_URL}}"}
        </p>
      </article>
    </section>
  );
}
