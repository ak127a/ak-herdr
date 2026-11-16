export class TabOrder {
  constructor() {
    this.tabs = new Map();
  }

  observe(spaces) {
    const moves = [];
    const next = new Map();
    for (const space of spaces) {
      const previous = this.tabs.get(space.id);
      next.set(space.id, new Set(space.tabs.map(tab => tab.id)));
      if (!previous) continue;
      for (const tab of space.tabs) {
        if (!previous.has(tab.id)) moves.push({ id: tab.id, index: space.tabs.length });
      }
    }
    this.tabs = next;
    return moves;
  }
}
