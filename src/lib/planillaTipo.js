// Whether a file opens as a spreadsheet (planilla.js), apart so the preview knows it without loading the reader.
const XLSX = /^application\/vnd\.(openxmlformats-officedocument\.spreadsheetml\.sheet|ms-excel\.sheet\.macroenabled\.12)$/i;
const extension = (nombre) => /\.([a-z0-9]+)$/i.exec(nombre ?? '')?.[1]?.toLowerCase() ?? '';

/** 'xlsx', 'csv' or null: whether a file opens as a spreadsheet, by its type or its name. */
export function tipoDePlanilla({ mime, archivo }) {
  const ext = extension(archivo);
  if (XLSX.test(mime ?? '') || ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (/^text\/csv$/i.test(mime ?? '') || ext === 'csv') return 'csv';
  return null;
}
