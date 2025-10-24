import { faker } from "@faker-js/faker";
import { client } from "../http/client.ts";

// --- Simulation Configuration ---
const config = {
  baseUrl: "http://localhost:9090",
  apiKey: "qnt_5a104bc4093042e98dc1cacfad017762",
  sourceName: "crm_events",
  numInitialEvents: 10000,
  eventsPerSecond: { min: 2, max: 6 },
  totalDealValuePerMinute: 1000000,
};

// --- Data Models ---
const productCategories = ["Software", "Hardware", "Services", "Consulting"];
const regions = {
  "NA": ["USA", "Canada", "Mexico"],
  "EMEA": ["Germany", "France", "UK", "Spain"],
  "APAC": ["China", "Japan", "India", "Australia"],
};
const customerSegments = ["Enterprise", "SMB", "Startup", "Government"];
const dealStages = [
  "Prospecting",
  "Qualification",
  "Needs Analysis",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];
const salesReps = [
  "Johanna Doe",
  "Park Chickenberg",
  "Sam Escman",
  "Vin Gazoline",
  "Dat Salesman",
];

// --- HTTP Client Setup ---
const apiClient = client();
apiClient.configure({
  baseUrl: config.baseUrl,
  apiKey: config.apiKey,
});

// --- Main Simulation Logic ---
async function runSimulation() {
  console.log("--- Starting Live CRM Simulation ---");

  // 1. Setup Event Source
  console.log(`1. Ensuring event source '${config.sourceName}' exists...`);
  const { data: sources } = await apiClient.getApiEventSources();
  let source = sources?.find((s) => s.name === config.sourceName);

  if (!source) {
    console.log(`   - Source not found. Creating...`);
    const { data: newSource } = await apiClient.postApiEventSources({
      body: {
        name: config.sourceName,
        eventTypes: [
          { name: "deal_created" },
          { name: "deal_stage_changed" },
          { name: "deal_won" },
          { name: "deal_lost" },
        ],
      },
    });
    source = newSource;
    console.log(`   - Source created with ID: ${source!.id}`);
  } else {
    console.log(`   - Source found with ID: ${source.id}`);
  }
  const sourceId = source!.id!;

  // 2. Seed Initial Data
  if (Deno.args.includes("--seed")) {
    console.log(`2. Seeding ${config.numInitialEvents} initial events...`);
    const seedStartTime = performance.now();
    for (let i = 0; i < config.numInitialEvents; i++) {
      const event = generateRandomEvent();
      await apiClient.postApiEventsSourceIdEvents({
        path: { sourceId },
        body: event,
      });
      if ((i + 1) % 1000 === 0) {
        console.log(`   - Seeded ${i + 1} / ${config.numInitialEvents} events`);
      }
    }
    const seedEndTime = performance.now();
    console.log(
      `   - Seeding finished in ${(seedEndTime - seedStartTime) / 1000}s`,
    );
  }

  // 3. Generate Real-time Events
  console.log("3. Starting real-time event generation...");
  let minuteDealValue = 0;

  setInterval(async () => {
    const numEvents = faker.number.int(config.eventsPerSecond);
    const events = [];
    for (let i = 0; i < numEvents; i++) {
      const event = generateRandomEvent("deal_created");
      // Adjust deal value to meet the constant sum per minute
      const remainingValue = config.totalDealValuePerMinute - minuteDealValue;
      const dealValue = faker.number.int({
        max: Math.min(50000, remainingValue),
      });
      event.payload.deal_value = dealValue;
      minuteDealValue += dealValue;
      event.timestamp = new Date(new Date().getTime() - i * (1000 / numEvents))
        .toISOString();
      events.push(event);
    }

    await apiClient.postApiEventsSourceIdEvents({
      path: { sourceId },
      body: events,
    });
    console.log(`   - Sent ${events.length} new events.`);
  }, 1000);

  // Reset the minute counter
  setInterval(() => {
    console.log(
      `   - Minute reset. Total deal value this minute: ${minuteDealValue}`,
    );
    minuteDealValue = 0;
  }, 60000);
}

// --- Event Generation Helper ---
function generateRandomEvent(eventType?: string) {
  const region = faker.helpers.arrayElement(Object.keys(regions));
  const country = faker.helpers.arrayElement(
    regions[region as keyof typeof regions],
  );

  return {
    uuid: faker.string.uuid() as string,
    type: eventType ||
      faker.helpers.arrayElement([
        "deal_created",
        "deal_stage_changed",
        "deal_won",
        "deal_lost",
      ]),
    payload: {
      deal_id: faker.string.uuid(),
      deal_value: faker.number.int({ min: 1000, max: 250000 }),
      product_category: faker.helpers.arrayElement(productCategories),
      region,
      country,
      sales_rep: faker.helpers.arrayElement(salesReps),
      customer_segment: faker.helpers.arrayElement(customerSegments),
      deal_stage: faker.helpers.arrayElement(dealStages),
    },
    timestamp: faker.date.recent({ days: 30 }).toISOString(),
  };
}

// --- Start the simulation ---
runSimulation().catch(console.error);
