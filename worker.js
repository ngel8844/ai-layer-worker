import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("POST { fileId, accessToken }", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { fileId, accessToken } = body || {};
    if (!fileId || !accessToken) {
      return new Response("Missing fileId or accessToken", { status: 400 });
    }

    // Custom range-based loader for Google Drive
    const transport = {
      async getRange(begin, end) {
        const res = await fetch(
          "https://www.googleapis.com/drive/v3/files/" +
            encodeURIComponent(fileId) +
            "?alt=media",
          {
            headers: {
              Authorization: "Bearer " + accessToken,
              Range: "bytes=" + begin + "-" + (end - 1),
            },
          }
        );

        if (res.status !== 206 && !res.ok) {
          throw new Error("Range fetch failed");
        }

        return new Uint8Array(await res.arrayBuffer());
      },

      async getFullReader() {
        // pdf.js requires this, but we never want it to download full file
        throw new Error("Full read not allowed");
      },
    };

    // Load PDF via pdf.js using range loader
    const loadingTask = pdfjsLib.getDocument({
      range: transport,
      disableStream: false,
      disableAutoFetch: false,
    });

    const pdf = await loadingTask.promise;

    // Read Catalog → OCProperties
    const catalog = await pdf.catalog;
    const ocProps = await catalog.get("OCProperties");
    if (!ocProps) {
      return Response.json({ visibleLayers: [] });
    }

    const ocgs = await ocProps.get("OCGs");
    const d = await ocProps.get("D");

    const off = new Set();
    if (d && d.has("OFF")) {
      const offArr = await d.get("OFF");
      for (const ref of offArr) off.add(ref.num);
    }

    const visible = [];

    for (const ocgRef of ocgs) {
      if (off.has(ocgRef.num)) continue;
      const ocg = await pdf.xref.fetch(ocgRef);
      const name = ocg.get("Name");
      if (name) visible.push(name);
    }

    return Response.json({ visibleLayers: visible });
  },
};
