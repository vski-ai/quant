// TODO: This a prototype

import { AuthStorage } from "./storage.ts";

export type ReporterConfig = {
  url: string;
  interval: number;
};

export function createReporter(
  storage: AuthStorage,
  config: ReporterConfig,
) {
  async function reportUsage() {
    const usageData = await storage.getAllUsage();
    const report = {
      timestamp: new Date(),
      usage: usageData,
    };

    try {
      await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(report),
      });
    } catch (error) {
      console.error("Failed to report usage data:", error);
    }
  }

  return {
    start() {
      setInterval(() => {
        reportUsage();
      }, config.interval);
    },
  };
}
