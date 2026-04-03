export type BrowserTab = {
  targetId: string;
  title: string;
  url: string;
  type: "page" | "background_page" | "service_worker" | "other";
};

export type SnapshotAriaNode = {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  depth: number;
};

export type RoleRefMap = Record<
  string,
  { role: string; name?: string; nth?: number }
>;

export type RoleSnapshotOptions = {
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
};

export type SnapshotStats = {
  lines: number;
  chars: number;
  refs: number;
  interactive: number;
};
