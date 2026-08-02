export const SCHEDULER_CONFIG = {
  recentPairLimit: 20,
  recentPlayerLimit: 10,
  coverageComparisonBand: 2,
  earlyProminenceRate: 0.65,
  prominenceFullThrough: 20,
  prominenceEndsAt: 50,
  eloSimilarityStartsAt: 50,
  eloSimilarityFullAt: 110,
  lateSimilarityPreferenceRate: 0.8,
  featuredScoreThreshold: 3,
  highParticipationMinutes: 900,
  softWeights: {
    connectivity: 0.12,
    eloSimilarity: 1,
    prominence: 0.5,
    recentPlayerPenalty: 0.2,
  },
} as const;
