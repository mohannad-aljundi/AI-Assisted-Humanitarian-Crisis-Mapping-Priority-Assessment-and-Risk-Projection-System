import { assertCrisisIconValidations, TOP_BAR_SLOT_ORDER } from "../src/lib/crisisIconValidation";

const SAMPLE_CRISIS_TYPES = [
  "Armed Conflict",
  "Flood",
  "Earthquake",
  "Cholera Outbreak",
  "Refugee Displacement",
  "Food Insecurity",
  "Hospital Attack",
  "Wildfire",
  "Hurricane",
  "Drought",
  "Infrastructure Damage",
  "Explosion",
  "Shelter Crisis",
  "Water Sanitation",
  null,
  "Unknown Event",
];

try {
  assertCrisisIconValidations(SAMPLE_CRISIS_TYPES);

  if (TOP_BAR_SLOT_ORDER.length !== 9) {
    throw new Error(`Expected 9 TopBar slots, got ${TOP_BAR_SLOT_ORDER.length}.`);
  }

  console.log("Crisis UI validation passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
