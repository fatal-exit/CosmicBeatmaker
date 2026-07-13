export function validateCompleteSampleBuild(
  packDirectory: string,
  runtimeAssetsPath: string,
): {
  authoredCount: number;
  proceduralCount: number;
  totalCount: number;
};

export function validatePackAssetIdentity(sample: unknown): string;

export function promoteCompleteBuild(
  stagedPack: string,
  stagedRuntimeAssets: string,
  buildDirectory: string,
  options?: {
    packOutput?: string;
    runtimeAssetsOutput?: string;
    failAt?: (stage: string) => void;
  },
): void;
