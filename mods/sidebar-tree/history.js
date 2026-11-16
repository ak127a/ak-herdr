export class AgentHistory {
  constructor() {
    this.recent = [];
  }

  observe(agents, focus) {
    this.recent = this.recent.filter(address => agents.some(a => a.address === address));
    const current = focus?.shown ?? focus?.terminal;
    if (agents.some(a => a.address === current)) {
      this.recent = [current, ...this.recent.filter(address => address !== current)];
    }
  }

  target(agents, focus) {
    this.observe(agents, focus);
    const current = focus?.shown ?? focus?.terminal;
    return this.recent.find(address => address !== current) ?? null;
  }
}

export class NavigationHistory {
  constructor() {
    this.spaces = [];
    this.tabs = {};
  }

  observe(spaces) {
    this.spaces = this.spaces.filter(id => spaces.some(s => s.id === id));
    for (const id of Object.keys(this.tabs)) {
      const space = spaces.find(s => s.id === id);
      if (!space) delete this.tabs[id];
      else this.tabs[id] = this.tabs[id].filter(id => space.tabs.some(t => t.id === id));
    }
    const active = spaces.find(s => s.active);
    if (!active) return;
    this.spaces = [active.id, ...this.spaces.filter(id => id !== active.id)];
    const tab = active.tabs.find(t => t.active);
    if (tab) this.tabs[active.id] = [tab.id, ...(this.tabs[active.id] ?? []).filter(id => id !== tab.id)];
  }

  target(kind, spaces) {
    this.observe(spaces);
    const active = spaces.find(s => s.active);
    return (kind === "last_space" ? this.spaces[1] : this.tabs[active?.id]?.[1]) ?? null;
  }
}
