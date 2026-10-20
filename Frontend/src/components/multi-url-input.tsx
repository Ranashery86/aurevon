"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  extractUniqueUrls,
  looksLikeUrlOrDomain,
} from "@/lib/services/costs";

const FILE_EXTENSIONS = ["xlsx", "xls", "csv"];

export const MULTI_URL_MODES = [
  { id: "manual", label: "Manual Entry" },
  { id: "upload", label: "Upload Excel/CSV" },
] as const;

export type MultiUrlMode = (typeof MULTI_URL_MODES)[number]["id"];

// Everything a multi-URL service needs from its input UI. The URL list is
// already normalized + de-duplicated here, so a service can read `urls` for
// the live count, the credit preview and the submitted payload without ever
// re-deriving it — the count on screen can never disagree with what is sent.
export type MultiUrlInputState = {
  mode: MultiUrlMode;
  setMode: (mode: MultiUrlMode) => void;
  manualText: string;
  setManualText: (text: string) => void;
  urls: string[];
  fileName: string | null;
  parseError: string | null;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

// Owns the manual/upload state and the spreadsheet parsing for every
// multi-URL service (Website Crawler, Tech Stack Detector, ...).
//
// Spreadsheet convention — deliberately NOT a named column: every cell in
// every column of every sheet that looks like a URL or domain is collected
// (a dot and no whitespace, per looksLikeUrlOrDomain). Services share this so
// an uploaded file works identically across all of them.
export function useMultiUrlInput(): MultiUrlInputState {
  const [mode, setMode] = useState<MultiUrlMode>("manual");
  const [manualText, setManualText] = useState("");
  const [uploadedCells, setUploadedCells] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Final URL list: normalize + dedupe, regardless of input mode, so the live
  // count/cost and the submitted payload are always in sync. Mirrors the
  // server-side re-validation in each service's trigger route.
  const urls = useMemo(() => {
    const raw =
      mode === "manual"
        ? manualText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : uploadedCells;
    return extractUniqueUrls(raw);
  }, [mode, manualText, uploadedCells]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTENSIONS.includes(ext)) {
      setParseError(
        "Unsupported file type. Please upload an .xlsx, .xls, or .csv file."
      );
      setUploadedCells([]);
      setFileName(null);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const cells: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
        }) as unknown[][];

        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (cell == null) continue;
            const text = String(cell).trim();
            if (text && looksLikeUrlOrDomain(text)) cells.push(text);
          }
        }
      }

      if (cells.length === 0) {
        setParseError("No URLs or domains found in this file.");
        setUploadedCells([]);
        setFileName(file.name);
        return;
      }

      setUploadedCells(cells);
      setFileName(file.name);
    } catch {
      setParseError(
        "Could not read that file. Check it's a valid .xlsx, .xls, or .csv."
      );
      setUploadedCells([]);
      setFileName(null);
    }
  };

  return {
    mode,
    setMode,
    manualText,
    setManualText,
    urls,
    fileName,
    parseError,
    handleFileChange,
  };
}

// The multi-URL input UI: mode toggle + manual textarea / spreadsheet picker.
// Renders the mode toggle as its first child so a caller can place this as the
// first child of a `mt-5 space-y-4` form and get the same spacing as the
// hand-rolled markup it replaces.
export function MultiUrlInput({
  state,
  idPrefix,
  manualLabel = "URLs (one per line)",
  uploadHint = "Every cell that looks like a URL or domain is picked up from any column or sheet (a value containing a dot and no whitespace).",
}: {
  state: MultiUrlInputState;
  // Unique per service so two instances on one page can't collide on the
  // textarea/label ids.
  idPrefix: string;
  manualLabel?: string;
  uploadHint?: string;
}) {
  const { mode, setMode, manualText, setManualText, fileName, parseError, handleFileChange } =
    state;
  const textareaId = `${idPrefix}-manual`;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {MULTI_URL_MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMode(option.id)}
            aria-pressed={mode === option.id}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              mode === option.id
                ? "bg-navy text-white"
                : "bg-mist text-navy hover:bg-navy/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <div>
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-semibold text-navy"
          >
            {manualLabel}
          </label>
          <textarea
            id={textareaId}
            rows={8}
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder={"example.com\nhttps://another-site.com\nthird-site.io"}
            className="w-full resize-y rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">
            Spreadsheet (.xlsx, .xls, or .csv)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-navy ring-1 ring-navy/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-mist">
            Choose file
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          <p className="mt-2 text-sm text-slate-500">{uploadHint}</p>
        </div>
      )}

      {fileName && (
        <p className="text-sm font-medium text-navy">Loaded: {fileName}</p>
      )}

      {parseError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
          {parseError}
        </p>
      )}
    </>
  );
}
