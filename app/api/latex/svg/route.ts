export const runtime = "nodejs";

interface LatexSvgRequest {
  latex: string;
  displayMode?: boolean;
}

interface LatexSvgResponse {
  svg: string;
}

interface MathjaxDocCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adaptor: any;
}

let cache: MathjaxDocCache | null = null;

async function getMathjaxDoc(): Promise<MathjaxDocCache> {
  if (cache) return cache;

  const [
    { mathjax },
    { TeX },
    { SVG },
    { liteAdaptor },
    { RegisterHTMLHandler },
    { AllPackages },
  ] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
    import("mathjax-full/js/input/tex/AllPackages.js"),
  ]);

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const doc = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: "none" }),
  });

  cache = { doc, adaptor };
  return cache;
}

export async function POST(request: Request): Promise<Response> {
  let body: LatexSvgRequest;
  try {
    body = (await request.json()) as LatexSvgRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { latex, displayMode = true } = body;

  if (!latex || typeof latex !== "string") {
    return Response.json({ error: "latex field is required" }, { status: 400 });
  }

  try {
    const { doc, adaptor } = await getMathjaxDoc();

    const node = doc.convert(latex.trim(), { display: displayMode });

    // The convert() result is a container; the SVG element is its first child
    const svgNode = adaptor.firstChild(node);
    const svg: string = adaptor.outerHTML(svgNode);

    return Response.json({ svg } satisfies LatexSvgResponse);
  } catch (err) {
    console.error("[latex/svg] MathJax conversion error:", err);
    return Response.json(
      { error: "Failed to convert LaTeX to SVG" },
      { status: 500 }
    );
  }
}
