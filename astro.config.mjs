// @ts-check
import { defineConfig } from "astro/config";
import { writeFile } from "node:fs/promises";

const adsTxtIntegration = {
  name: "configured-ads-txt",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const record = String(process.env.ADS_TXT_RECORD ?? "").trim();
      if (!record) return;
      const valid = /^google\.com,\s*pub-\d+,\s*(DIRECT|RESELLER),\s*f08c47fec0942fa0$/i.test(record);
      if (!valid) throw new Error("ADS_TXT_RECORD is not a valid Google ads.txt record.");
      await writeFile(new URL("ads.txt", dir), `${record}\n`, "utf8");
    },
  },
};

export default defineConfig({
  site: "https://seahawksfanzone.com",
  server: { port: 4322, host: true },
  integrations: [adsTxtIntegration],
});

