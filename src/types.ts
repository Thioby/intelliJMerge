export type OperationType = 'merge' | 'rebase' | 'cherry-pick';

export type ConflictStatus = 'Modified' | 'Deleted' | 'Added' | 'Unmerged';

export interface MergeState {
  operation: OperationType;
  targetBranch: string;
  sourceBranch: string;
}

export interface ConflictFile {
  path: string;
  oursStatus: ConflictStatus;
  theirsStatus: ConflictStatus;
  statusCode: string;
}

export type WebviewMessage =
  | { type: 'acceptOurs'; file: string }
  | { type: 'acceptTheirs'; file: string }
  | { type: 'merge'; file: string }
  | { type: 'refresh' };

export type ExtensionMessage =
  | { type: 'update'; conflicts: ConflictFile[]; mergeState: MergeState | null; merging: boolean }
  | { type: 'error'; message: string };
