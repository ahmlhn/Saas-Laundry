import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const penpotMcpHome = process.env.PENPOT_MCP_HOME || "C:\\Users\\ahmlh\\penpot-mcp\\mcp-server";
const penpotMcpUrl = process.env.PENPOT_MCP_URL || "http://localhost:4401/mcp";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blueprintDir =
  process.env.PENPOT_BLUEPRINT_DIR || path.resolve(__dirname, "..", "..", "docs", "penpot-blueprint");

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

const expectedPageNames = [
  "01 - Foundations",
  "02 - Auth",
  "03 - Home",
  "04 - Orders",
  "05 - Create Order",
  "06 - Operations",
  "07 - Account",
  "99 - Archive",
];

const placements = [
  {
    aliases: ["Imported • Foundations", "01 - Foundations"],
    targetPageIndex: 0,
    targetName: "01 - Foundations",
    svgFile: "00-foundations.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Login", "01 - Login"],
    targetPageIndex: 1,
    targetName: "01 - Login",
    svgFile: "01-login.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Outlet Select", "02 - Outlet Select"],
    targetPageIndex: 1,
    targetName: "02 - Outlet Select",
    svgFile: "02-outlet-select.svg",
    x: 504,
    y: 80,
  },
  {
    aliases: ["Imported • Home Default", "01 - Home Default"],
    targetPageIndex: 2,
    targetName: "01 - Home Default",
    svgFile: "03-home-default.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Home Alt Command Center", "02 - Home Alt - Command Center"],
    targetPageIndex: 2,
    targetName: "02 - Home Alt - Command Center",
    svgFile: "04-home-alt-command-center.svg",
    x: 504,
    y: 80,
  },
  {
    aliases: ["Imported • Home Alt Urgent First", "03 - Home Alt - Urgent First"],
    targetPageIndex: 2,
    targetName: "03 - Home Alt - Urgent First",
    svgFile: "05-home-alt-urgent-first.svg",
    x: 80,
    y: 976,
  },
  {
    aliases: ["Imported • Home Alt Role Adaptive", "04 - Home Alt - Role Adaptive"],
    targetPageIndex: 2,
    targetName: "04 - Home Alt - Role Adaptive",
    svgFile: "06-home-alt-role-adaptive.svg",
    x: 504,
    y: 976,
  },
  {
    aliases: ["Imported • Orders", "01 - Orders"],
    targetPageIndex: 3,
    targetName: "01 - Orders",
    svgFile: "07-orders.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Order Create Step 1 Customer", "01 - Step 1 - Customer"],
    targetPageIndex: 4,
    targetName: "01 - Step 1 - Customer",
    svgFile: "08-order-create-step-1-customer.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Order Create Step 2 Services", "02 - Step 2 - Services"],
    targetPageIndex: 4,
    targetName: "02 - Step 2 - Services",
    svgFile: "09-order-create-step-2-services.svg",
    x: 504,
    y: 80,
  },
  {
    aliases: ["Imported • Order Create Step 3 Review", "03 - Step 3 - Review"],
    targetPageIndex: 4,
    targetName: "03 - Step 3 - Review",
    svgFile: "10-order-create-step-3-review.svg",
    x: 928,
    y: 80,
  },
  {
    aliases: ["Imported • Order Detail", "01 - Order Detail"],
    targetPageIndex: 5,
    targetName: "01 - Order Detail",
    svgFile: "11-order-detail.svg",
    x: 80,
    y: 80,
  },
  {
    aliases: ["Imported • Payment", "02 - Payment"],
    targetPageIndex: 5,
    targetName: "02 - Payment",
    svgFile: "12-payment.svg",
    x: 504,
    y: 80,
  },
  {
    aliases: ["Imported • Account", "01 - Account"],
    targetPageIndex: 6,
    targetName: "01 - Account",
    svgFile: "13-account.svg",
    x: 80,
    y: 80,
  },
];

function buildRenamePagesCode(pageNames) {
  return `
const pageNames = ${JSON.stringify(pageNames)};
const file = penpot.currentFile;
if (!file) {
  throw new Error("No Penpot file is currently open.");
}
if (file.pages.length < pageNames.length) {
  throw new Error(\`Expected at least \${pageNames.length} pages but found \${file.pages.length}.\`);
}
for (let i = 0; i < pageNames.length; i += 1) {
  file.pages[i].name = pageNames[i];
}
return file.pages.slice(0, pageNames.length).map((page) => ({ id: page.id, name: page.name }));
`;
}

function buildPlacementCode(placement, svgString) {
  return `
const config = ${JSON.stringify({
    aliases: placement.aliases,
    targetPageIndex: placement.targetPageIndex,
    targetName: placement.targetName,
    x: placement.x,
    y: placement.y,
})};
const svgString = ${JSON.stringify(svgString)};
const file = penpot.currentFile;
if (!file) {
  throw new Error("No Penpot file is currently open.");
}
const pages = file.pages;
const targetPage = pages[config.targetPageIndex];
if (!targetPage) {
  throw new Error(\`Target page index \${config.targetPageIndex} not found.\`);
}

for (const page of pages) {
  const toRemove = page.root.children.filter((child) =>
    [config.targetName, ...config.aliases].includes(child.name)
  );
  for (const child of toRemove) {
    child.remove();
  }
}

const shape = await penpot.createShapeFromSvgWithImages(svgString);
if (!shape) {
  throw new Error(\`Penpot returned null while importing \${config.targetName}.\`);
}

shape.name = config.targetName;
shape.x = config.x;
shape.y = config.y;

await sleep(150);

const ownerPage = penpotUtils.getPageForShape(shape);
return {
  id: shape.id,
  name: shape.name,
  page: ownerPage ? ownerPage.name : null,
  x: shape.x,
  y: shape.y,
};
`;
}

function buildOpenPageCode(targetPageIndex) {
  return `
const targetPageIndex = ${JSON.stringify(targetPageIndex)};
const file = penpot.currentFile;
if (!file) {
  throw new Error("No Penpot file is currently open.");
}
const page = file.pages[targetPageIndex];
if (!page) {
  throw new Error(\`Target page index \${targetPageIndex} not found.\`);
}
penpot.openPage(page);
return {
  requested: page.name,
  current: penpot.currentPage ? penpot.currentPage.name : null,
};
`;
}

function buildSummaryCode(pageNames) {
  return `
const pageNames = ${JSON.stringify(pageNames)};
const file = penpot.currentFile;
if (!file) {
  throw new Error("No Penpot file is currently open.");
}

const summary = file.pages.slice(0, pageNames.length).map((page) => ({
  id: page.id,
  name: page.name,
  children: page.root.children.map((child) => ({
    id: child.id,
    name: child.name,
    type: child.type,
    x: child.x,
    y: child.y,
    })),
}));

return summary;
`;
}

async function main() {
  const { Client, StreamableHTTPClientTransport } = await loadMcpSdk();
  const client = new Client({
    name: "saas-laundry-penpot-organize",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(penpotMcpUrl));

  try {
    await client.connect(transport);
    const renamedPages = await client.callTool({
      name: "execute_code",
      arguments: {
        code: buildRenamePagesCode(expectedPageNames),
      },
    });

    if (renamedPages.isError) {
      const parsed = parseTextResult(renamedPages);
      throw new Error(typeof parsed === "string" ? parsed : "Failed renaming Penpot pages.");
    }

    const placed = [];
    for (const placement of placements) {
      const openResult = await client.callTool({
        name: "execute_code",
        arguments: {
          code: buildOpenPageCode(placement.targetPageIndex),
        },
      });
      const openParsed = parseTextResult(openResult);
      if (openResult.isError) {
        throw new Error(typeof openParsed === "string" ? openParsed : `Failed opening page for ${placement.targetName}.`);
      }

      const svgString = await fs.readFile(path.join(blueprintDir, placement.svgFile), "utf8");
      const result = await client.callTool({
        name: "execute_code",
        arguments: {
          code: buildPlacementCode(placement, svgString),
        },
      });

      const parsed = parseTextResult(result);
      if (result.isError) {
        throw new Error(typeof parsed === "string" ? parsed : `Failed placing ${placement.targetName}.`);
      }

      placed.push(parsed.result ?? parsed);
    }

    const summaryResult = await client.callTool({
      name: "execute_code",
      arguments: {
        code: buildSummaryCode(expectedPageNames),
      },
    });

    const summary = parseTextResult(summaryResult);
    if (summaryResult.isError) {
      throw new Error(typeof summary === "string" ? summary : "Failed reading Penpot summary.");
    }

    await client.callTool({
      name: "execute_code",
      arguments: {
        code: buildOpenPageCode(2),
      },
    });

    console.log(JSON.stringify({ placed, summary: summary.result ?? summary }, null, 2));
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
