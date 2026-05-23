export type ExclusionPolicy = "same-provider" | "same-model";
export type DefaultReviewers = "all-eligible" | "ask";
export type WingmanMode = "second-opinion";
export type ReviewerStatus = "pending" | "running" | "ok" | "failed" | "cancelled";
export type TargetConfidence = "high" | "medium" | "low";

export type WingmanReviewerConfig = {
  name: string;
  provider: string;
  model: string;
  thinking?: string;
};

export type WingmanConfig = {
  version: 1;
  exclude: ExclusionPolicy;
  defaultReviewers: DefaultReviewers;
  maxParallelReviewers: number;
  reviewers: WingmanReviewerConfig[];
};

export type ConfigSource = "global" | "project" | "merged";

export type ModelRef = {
  providerID: string;
  modelID: string;
  name: string;
  reasoning?: boolean;
};

export type CurrentModel = {
  providerID: string;
  modelID: string;
};

export type ResolvedReviewer = WingmanReviewerConfig & {
  key: string;
  label: string;
  sameProvider: boolean;
  sameModel: boolean;
  modelRef: ModelRef;
  source: ConfigSource;
};

export type WingmanTarget =
  | { type: "question-consensus"; question: string; confidence: TargetConfidence }
  | { type: "current-plan"; text: string; confidence: TargetConfidence }
  | { type: "working-tree"; confidence: TargetConfidence }
  | { type: "branch-diff"; base: string; confidence: TargetConfidence }
  | { type: "commit"; sha: string; confidence: TargetConfidence }
  | { type: "files"; paths: string[]; confidence: TargetConfidence }
  | { type: "last-turn"; text: string; confidence: TargetConfidence }
  | { type: "freeform"; focus: string; confidence: TargetConfidence };

export type WingmanContextPack = {
  target: WingmanTarget;
  label: string;
  focus: string;
  mode: WingmanMode;
  cwd: string;
  content: string;
  reason: string;
};

export type ReviewerResult = {
  reviewer: ResolvedReviewer;
  status: Exclude<ReviewerStatus, "pending" | "running">;
  round: number;
  prompt: string;
  output?: string;
  summary?: string;
  error?: string;
  artifactMarkdownPath?: string;
  artifactJsonPath?: string;
};

export type WingmanRunResult = {
  runId: string;
  request: string;
  mode: WingmanMode;
  target: WingmanTarget;
  targetLabel: string;
  rounds: number;
  cancelled: boolean;
  results: ReviewerResult[];
  artifactDir: string;
  summaryPath: string;
  synthesisInputPath: string;
  text: string;
};
