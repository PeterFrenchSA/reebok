import Papa from "papaparse";

export function toCsv(data: Array<Record<string, unknown>>): string {
  return Papa.unparse(data);
}

export function fromCsv(content: string): Array<Record<string, string>> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}
