/**
 * A section within an inspection (for newspapers, magazines, etc.)
 */
export interface InspectionSection {
  heading?: string;
  text: string;
  image?: string;
}

/**
 * Raw inspection data from JSON file
 */
export interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  content?: string;          // Simple single-content format
  sections?: InspectionSection[];  // Multi-section format (newspapers, etc.)
}

/**
 * Loaded inspection with metadata
 */
export interface LoadedInspection {
  data: InspectionData;
}

/**
 * Definition of an inspectable object in a region
 */
export interface InspectableDefinition {
  id: string;
  position: { x: number; y: number; z: number };
  inspectionId: string;
  promptText?: string;
}
