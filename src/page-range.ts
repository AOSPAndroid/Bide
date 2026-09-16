export function selectPages(value: string, count: number) {
  if (!value?.trim()) return Array.from({ length: count }, (_, i) => i);
  const result: number[] = [];
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`Use page numbers from 1 to ${count}, such as 1-3, 5.`);
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > count) throw new Error(`Page range must be between 1 and ${count}.`);
    for (let i = first; i <= last; i++) result.push(i - 1);
  }
  return result;
}
