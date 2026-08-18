/**
 * vader-sentiment ships no type declarations, so this describes the slice of
 * its API we use. Verified against vader-sentiment@1.1.3.
 */
declare module "vader-sentiment" {
  export interface PolarityScores {
    /** Proportion of the text that reads negative (0-1). */
    neg: number;
    /** Proportion that reads neutral (0-1). */
    neu: number;
    /** Proportion that reads positive (0-1). */
    pos: number;
    /** Normalized, weighted composite score in [-1, 1]. */
    compound: number;
  }

  export const SentimentIntensityAnalyzer: {
    polarity_scores(input: string): PolarityScores;
  };
}
