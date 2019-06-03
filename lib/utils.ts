export function sampleSize(array: any[], n: number) {
  const shuffled = shuffleArray([...array]);

  return shuffled.slice(0, n);
}

export function shuffleArray(array: any[]) {
  const a = array.slice();

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}
