import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "data:application/javascript;base64,";

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") {
        return new Response("POST { fileId, accessToken }", { status: 405 });
      }

      const { fileId, accessToken } = await request.json();
      if (!fileId || !accessToken) {
        return new Response("Missing fileId or accessToken", { status: 400 });
      }

      // Custom range-based loader for Google Drive
      const rangeTransport = {
        getRange: async (begin, end) => {
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
      };

      const loadingTask = pdfjsLib.getDocument({
        range: rangeTransport,
        disableWorker: true,
        disableStream: false,
        disableAutoFetch: false,
      });

      const pdf = await loadingTask.promise;

      // Catalog → OCProperties
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
    } catch (err) {
      return new Response("Worker error: " + (err?.stack || err), {
        status: 500,
      });
    }
  },
};
