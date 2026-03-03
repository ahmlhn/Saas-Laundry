const appConfig = require("../../app.json")?.expo ?? {};

export const APP_VERSION: string =
  typeof appConfig.version === "string" && appConfig.version.trim().length > 0 ? appConfig.version.trim() : "1.0.0";
