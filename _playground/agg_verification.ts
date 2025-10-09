import { Engine } from "../core/engine.ts";
import {
  Granularity,
  IDatasetQuery,
  IEventSource,
  IReport,
} from "../core/mod.ts";
import { faker } from "@faker-js/faker";

/**
 * Defines the configuration for the advanced playground simulation.
 */
export interface BenchConfig {
  numSources: number;
  eventTypesPerSource: number;
  numEvents: number;
  attributions: Record<string, string[]>;
  payloadSchema: Record<string, "number" | "string" | "boolean">;
  partition: {
    granularity: Granularity;
    length: number; // Number of granularity units per partition
  };
}

/**
 * A simple in-memory ledger to calculate the expected final results.
 * This serves as the "ground truth" for verifying the engine's correctness.
 */
class Ledger {
  private results: Record<string, number> = {};

  public processEvent(
    eventType: string,
    payload: Record<string, any>,
  ): void {
    const countKey = `${eventType}_count`;
    this.results[countKey] = (this.results[countKey] || 0) + 1;

    const numericalFields: { key: string; value: number }[] = [];
    const categoricalFields: { key: string; value: string }[] = [];

    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === "number") {
        const sumKey = `${key}_sum`;
        this.results[sumKey] = (this.results[sumKey] || 0) + value;
        numericalFields.push({ key, value });
      } else if (typeof value === "string" || typeof value === "boolean") {
        categoricalFields.push({ key, value: String(value) });
        // This is the missing piece: calculate simple categorical counts.
        const categoryKey = `${key}_by_${String(value)}`;
        this.results[categoryKey] = (this.results[categoryKey] || 0) +
          1;
      }
    }

    for (const num of numericalFields) {
      for (const cat of categoricalFields) {
        const compoundKey = `${num.key}_sum_by_${cat.key}_${cat.value}`;
        this.results[compoundKey] = (this.results[compoundKey] || 0) +
          num.value;
      }
    }
  }

  public getResults(): Record<string, number> {
    return this.results;
  }
}

/**
 * Sets up and runs the advanced playground simulation with partitioning.
 * @param engine The analytics engine instance.
 * @param config The configuration for the simulation.
 * @returns An object containing the ground truth results and a function to query the engine for comparison.
 */
export async function runBench(
  engine: Engine,
  config: BenchConfig,
) {
  console.log("---= Starting Bench =---");

  const groundTruth = new Ledger();
  const sources: IEventSource[] = [];
  const allEventTypes: string[] = [];

  console.log("Setting up event sources and report...");
  for (let i = 0; i < config.numSources; i++) {
    const eventTypes = Array.from({ length: config.eventTypesPerSource }).map(
      (_, j) => ({ name: `adv_event_${i}_${j}` }),
    );
    allEventTypes.push(...eventTypes.map((et) => et.name));

    const source = await engine.createEventSource({
      name: `AdvancedSource_${i}`,
      eventTypes,
    });
    sources.push(source);
  }

  const report: IReport = {
    name: "Bench Verification Report",
    active: true,
  };
  const reportDoc = await engine.createReport(report);

  await engine.addAggregationSource(reportDoc._id.toString(), {
    targetCollection: "aggr_adv_bench",
    granularity: config.partition.granularity,
    filter: {
      sources: sources.map((s) => {
        const def = s.getDefinition();
        return { name: def.name, id: def.id! };
      }),
      events: allEventTypes,
    },
    partition: {
      enabled: true,
      length: config.partition.length,
    },
  });
  await new Promise((r) => setTimeout(r, 5000));

  console.log(`Generating ${config.numEvents} events...`);
  const simulationDays = 10;
  const generationStartTime = new Date(
    new Date().getTime() - simulationDays * 24 * 60 * 60 * 1000,
  );
  const generationEndTime = new Date();

  const startTime = performance.now();
  for (let i = 0; i < config.numEvents; i++) {
    const source = faker.helpers.arrayElement(sources);
    const eventTypes = await source.listEventTypes();
    const eventType = faker.helpers.arrayElement(eventTypes).name;

    const payload: Record<string, any> = {};
    for (const [key, type] of Object.entries(config.payloadSchema)) {
      if (type === "number") {
        payload[key] = faker.number.int({ min: 1, max: 1000 });
      } else if (type === "string") {
        payload[key] = faker.helpers.arrayElement(["A", "B", "C", "D"]);
      } else if (type === "boolean") payload[key] = faker.datatype.boolean();
    }

    const attributions = Object.entries(config.attributions).map(
      ([type, values]) => ({ type, value: faker.helpers.arrayElement(values) }),
    );
    const timestamp = faker.date.between({
      from: generationStartTime,
      to: generationEndTime,
    });

    await source.record(
      crypto.randomUUID(),
      eventType,
      payload,
      attributions,
      timestamp,
    );
    groundTruth.processEvent(eventType, payload);

    if ((i + 1) % 10000 === 0) {
      console.log(`  ... ${i + 1} / ${config.numEvents} events generated.`);
    }
  }
  const endTime = performance.now();
  const generationDuration = (endTime - startTime) / 1000;
  console.log(
    `Event generation finished in ${generationDuration.toFixed(2)} seconds.`,
  );

  return {
    reportDoc,
    groundTruthResults: groundTruth.getResults(),
    getQuery(granularity: Granularity) {
      return {
        reportId: reportDoc._id.toString(),
        timeRange: { start: generationStartTime, end: generationEndTime },
        granularity,
      };
    },
    getEngineReport: async (granularity: Granularity) => {
      const query: IDatasetQuery = {
        reportId: reportDoc._id.toString(),
        timeRange: { start: generationStartTime, end: generationEndTime },
        granularity: granularity,
      };
      const start = new Date();
      const report = await engine.getDataset(query);
      console.log(
        "Query time:",
        new Date(new Date().getTime() - start.getTime()).getTime() / 1000 + "s",
      );
      // Merge results from all days into a single object for comparison
      return report.reduce((acc, dataPoint) => {
        for (const key in dataPoint) {
          if (key !== "timestamp") {
            acc[key] = (acc[key] || 0) + (dataPoint[key] as number);
          }
        }
        return acc;
      }, {} as Record<string, number>);
    },
  };
}
