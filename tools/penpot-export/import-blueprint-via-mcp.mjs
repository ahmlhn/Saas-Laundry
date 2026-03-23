import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const blueprintDir = process.env.PENPOT_BLUEPRINT_DIR || path.join(repoRoot, "docs", "penpot-blueprint");
const manifestPath = path.join(blueprintDir, "manifest.json");
const penpotMcpHome = process.env.PENPOT_MCP_HOME || "C:\\Users\\ahmlh\\penpot-mcp\\mcp-server";
const penpotMcpUrl = process.env.PENPOT_MCP_URL || "http://localhost:4401/mcp";

const pageConfigs = {
  foundations: { pageName: "Blueprint • Foundations", columns: 1 },
  auth: { pageName: "Blueprint • Auth", columns: 2 },
  home: { pageName: "Blueprint • Home", columns: 2 },
  orders: { pageName: "Blueprint • Orders", columns: 1 },
  createOrder: { pageName: "Blueprint • Create Order", columns: 3 },
  operations: { pageName: "Blueprint • Operations", columns: 2 },
  account: { pageName: "Blueprint • Account", columns: 1 },
};

const pageOrder = [
  "foundations",
  "auth",
  "home",
  "orders",
  "createOrder",
  "operations",
  "account",
];

function screenBucket(fileName) {
  if (fileName === "00-foundations.svg") return "foundations";
  if (fileName === "01-login.svg" || fileName === "02-outlet-select.svg") return "auth";
  if (
    fileName === "03-home-default.svg" ||
    fileName === "04-home-alt-command-center.svg" ||
    fileName === "05-home-alt-urgent-first.svg" ||
    fileName === "06-home-alt-role-adaptive.svg"
  ) {
    return "home";
  }
  if (fileName === "07-orders.svg") return "orders";
  if (
    fileName === "08-order-create-step-1-customer.svg" ||
    fileName === "09-order-create-step-2-services.svg" ||
    fileName === "10-order-create-step-3-review.svg"
  ) {
    return "createOrder";
  }
  if (fileName === "11-order-detail.svg" || fileName === "12-payment.svg") return "operations";
  if (fileName === "13-account.svg") return "account";
  throw new Error(`Unhandled blueprint file: ${fileName}`);
}

function screenTitle(fileName) {
  const base = fileName.replace(/^\d+-/, "").replace(/\.svg$/, "");
  return base
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function positionFor(bucket, index, width, height) {
  const gapX = 64;
  const gapY = 96;
  const originX = 80;
  const originY = 80;
  const columns = pageConfigs[bucket].columns;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: originX + column * (width + gapX),
    y: originY + row * (height + gapY),
  };
}

function buildImportCode({ pageName, importedName, x, y, svg }) {
  return `
const pageName = ${JSON.stringify(pageName)};
const importedName = ${JSON.stringify(importedName)};
const svgString = ${JSON.stringify(svg)};
const targetX = ${x};
const targetY = ${y};

let page = penpotUtils.getPageByName(pageName);
if (!page) {
  page = penpot.createPage();
  page.name = pageName;
}

penpot.openPage(page);

for (const shape of page.findShapes({ name: importedName })) {
  shape.remove();
}

const group = await penpot.createShapeFromSvgWithImages(svgString);
if (!group) {
  throw new Error("Penpot returned null while importing SVG.");
}

group.name = importedName;
group.x = targetX;
group.y = targetY;

return {
  pageId: page.id,
  pageName: page.name,
  shapeId: group.id,
  shapeName: group.name,
  x: group.x,
  y: group.y,
};
`;
}

async function loadMcpSdk() {
  const clientModulePath = path.join(
    penpotMcpHome,
    "node_modules",
    "@modelcontextprotocol",
    "sdk",
    "dist",
    "esm",
    "client",
    "index.js"
  );
  const transportModulePath = path.join(
    penpotMcpHome,
    "node_modules",
    "@modelcontextprotocol",
    "sdk",
    "dist",
    "esm",
    "client",
    "streamableHttp.js"
  );

  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import(pathToFileURL(clientModulePath).href),
    import(pathToFileURL(transportModulePath).href),
  ]);

  return { Client, StreamableHTTPClientTransport };
}

function parseTextResult(result) {
  const textContent = (result.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  if (!textContent) {
    return null;
  }

  try {
    return JSON.parse(textContent);
  } catch {
    return textContent;
  }
}

function extractToolError(result, parsed) {
  if (result?.isError) {
    if (typeof parsed === "string" && parsed.trim().length > 0) {
      return parsed;
    }
    return "Tool execution failed.";
  }

  if (typeof parsed === "string" && parsed.startsWith("Tool execution failed:")) {
    return parsed;
  }

  return null;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const { Client, StreamableHTTPClientTransport } = await loadMcpSdk();

  const groupedFiles = new Map(pageOrder.map((bucket) => [bucket, []]));
  for (const file of manifest.files) {
    groupedFiles.get(screenBucket(file)).push(file);
  }

  const client = new Client({
    name: "saas-laundry-penpot-import",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(penpotMcpUrl));
  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    if (!toolNames.includes("execute_code")) {
      throw new Error("Penpot MCP server is reachable, but execute_code is not available.");
    }

    console.log(`Connected to Penpot MCP at ${penpotMcpUrl}`);
    console.log(`Tools: ${toolNames.join(", ")}`);

    const imports = [];

    for (const bucket of pageOrder) {
      const files = groupedFiles.get(bucket);
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const svg = await fs.readFile(path.join(blueprintDir, file), "utf8");
        const importedName = `Imported • ${screenTitle(file)}`;
        const { x, y } = positionFor(bucket, index, manifest.width, manifest.height);
        const pageName = pageConfigs[bucket].pageName;
        const code = buildImportCode({
          pageName,
          importedName,
          x,
          y,
          svg,
        });

        try {
          const result = await client.callTool({
            name: "execute_code",
            arguments: { code },
          });
          const parsed = parseTextResult(result);
          const toolError = extractToolError(result, parsed);
          if (toolError) {
            throw new Error(toolError);
          }
          imports.push(parsed);
          console.log(`Imported ${file} -> ${pageName}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed importing ${file}: ${message}`);
        }
      }
    }

    console.log(JSON.stringify({ imported: imports.length, items: imports }, null, 2));
  } finally {
    if (transport.close) {
      await transport.close();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
