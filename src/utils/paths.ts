export function pathLabel(path: string) {
  const parts = path.split(/[\\/]/);
  return {
    name: parts[parts.length - 1] || path,
    parent: parts[parts.length - 2] || "",
  };
}
