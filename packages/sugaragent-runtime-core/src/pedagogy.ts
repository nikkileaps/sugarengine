export type DeliveryDetailLevel = 'minimal' | 'concise' | 'expanded';

export interface DeliveryContract {
  detailLevel?: DeliveryDetailLevel;
  maxKnowledgeClaims?: number;
  maxKnowledgeParts?: number;
  maxSentences?: number;
  maxSentenceLength?: number;
  maxClauseDepth?: number;
  allowExactNumbers?: boolean;
  allowEnrichmentFacts?: boolean;
  preferConcreteFacts?: boolean;
  preferHighFrequencyLexicon?: boolean;
}

export interface PluginPedagogyContext {
  learnerBand?: string;
  supportLanguagePolicy?: string;
  targetLanguage?: string;
  supportLanguage?: string;
  correctionPosture?: string;
  deliveryContract?: DeliveryContract;
  responseContract?: {
    mode: string;
    choices?: string[];
    wordBank?: string[];
    maxLength?: number;
    hintText?: string;
  };
  availableTrackedLexicalEntryIds?: string[];
  teachingSubset?: {
    focusLexicalEntryIds: string[];
    reinforcementLexicalEntryIds: string[];
    ambientLexicalEntryIds: string[];
    protectedLexicalEntryIds: string[];
  };
  ambientHaloAllowance?: {
    allowHigherBandTracked: boolean;
    allowUntrackedFlavor: boolean;
    maxTrackedLookahead?: number;
    maxUntrackedPhrases?: number;
  };
  groundingScope?: Array<{
    lexicalEntryId: string;
    targetForm: string;
    worldObjectId?: string;
    worldAttribute?: string;
  }>;
  sceneSemantics?: Record<string, unknown>;
}
