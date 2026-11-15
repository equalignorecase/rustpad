export function pathLabel(path: string) {
  const clean = path.replace(/^\\\\\?\\/, "");
  const parts = clean.split(/[\\/]/);
  return {
    name: parts[parts.length - 1] || clean,
    parent: parts[parts.length - 2] || "",
  };
}
