// Aliases describe source locations only; they never change execution provenance.
export function compareSourceTrees(
  executionCommit,
  currentCommit,
  paths,
  readTree,
) {
  return paths.map((entry) => {
    const { path, executionPaths = [path] } =
      typeof entry === "string" ? { path: entry } : entry;
    let executionPath = null,
      executionTree = null;
    for (const candidate of executionPaths) {
      const tree = readTree(executionCommit, candidate);
      if (tree) {
        executionPath = candidate;
        executionTree = tree;
        break;
      }
    }
    const currentTree = readTree(currentCommit, path);
    return {
      path,
      executionPath,
      executionTree,
      currentTree,
      compatible: Boolean(
        executionTree && currentTree && executionTree === currentTree,
      ),
    };
  });
}
