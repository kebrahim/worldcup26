export function getPickOwner(pickIndex: number, snakeOrder: string[]): string {
  const p = snakeOrder.length;
  const round = Math.floor(pickIndex / p);
  const position = pickIndex % p;
  return round % 2 === 0 ? snakeOrder[position] : snakeOrder[p - 1 - position];
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
