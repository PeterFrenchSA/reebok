import OpenAI from "openai";

export type InvoiceExtraction = {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amountTotal?: number;
  vatAmount?: number;
  currency?: string;
  categoryHint?: string;
  lineItems?: Array<{
    description: string;
    quantity?: number;
    amount?: number;
  }>;
  notes?: string;
};

export async function extractInvoiceWithOpenAI(imageUrl: string): Promise<InvoiceExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OCR extraction");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extract structured invoice data from this image for bookkeeping. Return strict JSON only."
          },
          {
            type: "input_image",
            image_url: imageUrl
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "invoice_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            supplierName: { type: "string" },
            invoiceNumber: { type: "string" },
            invoiceDate: { type: "string" },
            dueDate: { type: "string" },
            amountTotal: { type: "number" },
            vatAmount: { type: "number" },
            currency: { type: "string" },
            categoryHint: { type: "string" },
            notes: { type: "string" },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  description: { type: "string" },
                  quantity: { type: "number" },
                  amount: { type: "number" }
                },
                required: ["description"]
              }
            }
          },
          required: []
        }
      }
    }
  } as any);

  const content = response.output_text;
  if (!content) {
    return {};
  }

  return JSON.parse(content) as InvoiceExtraction;
}
