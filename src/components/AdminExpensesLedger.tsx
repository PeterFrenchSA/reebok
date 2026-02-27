"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadDocument } from "@/lib/client-upload";

type ExpenseCategory =
  | "RATES"
  | "WATER"
  | "ELECTRICITY"
  | "INSURANCE"
  | "MAINTENANCE"
  | "GENERAL_MAINTENANCE"
  | "CONSUMABLES"
  | "OTHER";

type Expense = {
  id: string;
  category: ExpenseCategory;
  title: string;
  description?: string | null;
  supplier?: string | null;
  invoiceNumber?: string | null;
  amount: string | number;
  currency: string;
  serviceDate?: string | null;
  dueDate?: string | null;
  paidDate?: string | null;
  invoiceFileUrl?: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
};

type PanelState = { type: "idle" | "success" | "error"; message?: string };

const categories: ExpenseCategory[] = [
  "RATES",
  "WATER",
  "ELECTRICITY",
  "INSURANCE",
  "MAINTENANCE",
  "GENERAL_MAINTENANCE",
  "CONSUMABLES",
  "OTHER"
];

const defaultForm = {
  category: "OTHER" as ExpenseCategory,
  title: "",
  description: "",
  supplier: "",
  invoiceNumber: "",
  amount: "",
  serviceDate: "",
  dueDate: "",
  paidDate: "",
  invoiceFileUrl: ""
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

function dateLabel(value?: string | null): string {
  return value ? value.slice(0, 10) : "Not set";
}

function moneyLabel(currency: string, amount: string | number): string {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function AdminExpensesLedger() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [state, setState] = useState<PanelState>({ type: "idle" });
  const [form, setForm] = useState(defaultForm);

  const total = useMemo(
    () => expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    [expenses]
  );

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/expenses?take=500", { cache: "no-store" });
      const data = (await response.json()) as { expenses?: Expense[]; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not load expenses.") });
        return;
      }
      setExpenses(data.expenses ?? []);
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not load expenses." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  async function saveExpense() {
    const amount = Number(form.amount);
    if (form.title.trim().length < 2) {
      setState({ type: "error", message: "Expense title must be at least 2 characters." });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setState({ type: "error", message: "Amount must be a non-negative number." });
      return;
    }

    setSaving(true);
    setState({ type: "idle" });
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          supplier: form.supplier.trim() || undefined,
          invoiceNumber: form.invoiceNumber.trim() || undefined,
          amount,
          currency: "ZAR",
          serviceDate: form.serviceDate || undefined,
          dueDate: form.dueDate || undefined,
          paidDate: form.paidDate || undefined,
          invoiceFileUrl: form.invoiceFileUrl.trim() || undefined
        })
      });
      const data = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Could not save expense.") });
        return;
      }

      setForm(defaultForm);
      await loadExpenses();
      setState({ type: "success", message: "Expense saved to ledger." });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Could not save expense." });
    } finally {
      setSaving(false);
    }
  }

  async function handleInvoiceUpload(file: File) {
    setUploading(true);
    setState({ type: "idle" });
    try {
      const uploaded = await uploadDocument(file);
      setForm((current) => ({ ...current, invoiceFileUrl: uploaded.url }));
      setState({ type: "success", message: `Uploaded ${uploaded.name}.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function importExpenses(file: File) {
    const ext = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";

    setImporting(true);
    setState({ type: "idle" });
    try {
      let payloadData = "";
      if (ext === "csv") {
        payloadData = await file.text();
      } else {
        payloadData = toBase64(await file.arrayBuffer());
      }

      const response = await fetch("/api/finance/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "expenses",
          format: ext,
          data: payloadData
        })
      });
      const data = (await response.json()) as { imported?: number; error?: unknown };
      if (!response.ok) {
        setState({ type: "error", message: errorMessage(data, "Import failed.") });
        return;
      }

      await loadExpenses();
      setState({ type: "success", message: `Imported ${data.imported ?? 0} expenses.` });
    } catch (error) {
      console.error(error);
      setState({ type: "error", message: "Import failed." });
    } finally {
      setImporting(false);
    }
  }

  function exportLedger(format: "csv" | "xlsx") {
    const url = `/api/finance/export?entity=expenses&format=${format}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return <p className="lead">Loading expenses ledger...</p>;
  }

  return (
    <section className="grid">
      {state.type === "error" ? <p className="notice error">{state.message}</p> : null}
      {state.type === "success" ? <p className="notice success">{state.message}</p> : null}

      <article className="card grid">
        <h3>Expenses Summary</h3>
        <div className="inline">
          <div className="metric">
            <strong>{expenses.length}</strong>
            <span>Ledger entries</span>
          </div>
          <div className="metric">
            <strong>ZAR {total.toFixed(2)}</strong>
            <span>Total expenses listed</span>
          </div>
        </div>
      </article>

      <article className="card grid">
        <h3>Add Expense</h3>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="expense-category">Category</label>
            <select
              id="expense-category"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value as ExpenseCategory }))
              }
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense-title">Title</label>
            <input
              id="expense-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-amount">Amount (ZAR)</label>
            <input
              id="expense-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-supplier">Supplier</label>
            <input
              id="expense-supplier"
              value={form.supplier}
              onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-invoice-number">Invoice Number</label>
            <input
              id="expense-invoice-number"
              value={form.invoiceNumber}
              onChange={(event) => setForm((current) => ({ ...current, invoiceNumber: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-service-date">Service Date</label>
            <input
              id="expense-service-date"
              type="date"
              value={form.serviceDate}
              onChange={(event) => setForm((current) => ({ ...current, serviceDate: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-due-date">Due Date</label>
            <input
              id="expense-due-date"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="expense-paid-date">Paid Date</label>
            <input
              id="expense-paid-date"
              type="date"
              value={form.paidDate}
              onChange={(event) => setForm((current) => ({ ...current, paidDate: event.target.value }))}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="expense-description">Description</label>
          <textarea
            id="expense-description"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="expense-invoice-url">Invoice / Proof URL</label>
          <input
            id="expense-invoice-url"
            value={form.invoiceFileUrl}
            onChange={(event) => setForm((current) => ({ ...current, invoiceFileUrl: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="expense-invoice-upload">Upload Invoice / Supporting Document</label>
          <input
            id="expense-invoice-upload"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleInvoiceUpload(file);
              }
            }}
          />
        </div>
        <button type="button" className="btn-primary" disabled={saving || uploading} onClick={() => void saveExpense()}>
          {saving ? "Saving..." : uploading ? "Uploading..." : "Save Expense"}
        </button>
      </article>

      <article className="card grid">
        <h3>Import / Export</h3>
        <div className="action-row">
          <button type="button" className="btn-secondary" onClick={() => exportLedger("csv")}>
            Export CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => exportLedger("xlsx")}>
            Export XLSX
          </button>
        </div>
        <div className="field">
          <label htmlFor="expense-import-file">Import CSV/XLSX</label>
          <input
            id="expense-import-file"
            type="file"
            accept=".csv,.xlsx"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importExpenses(file);
              }
            }}
          />
        </div>
      </article>

      <article className="card grid">
        <h3>Ledger Entries</h3>
        {expenses.length === 0 ? (
          <p className="lead">No expenses captured yet.</p>
        ) : (
          <div className="table-list">
            {expenses.map((expense) => (
              <article key={expense.id} className="table-item">
                <p>
                  <strong>{expense.title}</strong> ({expense.category})
                </p>
                <p className="lead">
                  {moneyLabel(expense.currency, expense.amount)} | Service: {dateLabel(expense.serviceDate)} | Due:{" "}
                  {dateLabel(expense.dueDate)}
                </p>
                <p className="lead">
                  Supplier: {expense.supplier ?? "Not set"} | Invoice: {expense.invoiceNumber ?? "Not set"}
                </p>
                <p className="lead">Paid: {dateLabel(expense.paidDate)} | Entered by: {expense.createdBy?.name ?? "System"}</p>
                {expense.invoiceFileUrl ? (
                  <p>
                    <a href={expense.invoiceFileUrl} target="_blank" rel="noreferrer" className="doc-link">
                      Open supporting document
                    </a>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
