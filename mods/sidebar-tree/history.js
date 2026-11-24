function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export class AgentHistory {
  constructor(initial) {
    this.recent = Array.isArray(initial) ? initial.filter((x) => typeof x === "string") : [];
  }

  observe(agents, focus) {
    const prev = this.recent;
    let next = prev.filter((address) => agents.some((a) => a.address === address));
    const current = focus?.shown ?? focus?.terminal;
    if (agents.some((a) => a.address === current)) {
      next = [current, ...next.filter((address) => address !== current)];
    }
    this.recent = next;
    return !arraysEqual(prev, next);
  }

  target(agents, focus) {
    this.observe(agents, focus);
    const current = focus?.shown ?? focus?.terminal;
    return this.recent.find((address) => address !== current) ?? null;
  }

  serialize() {
    return this.recent;
  }
}

export class NavigationHistory {
  constructor(initial) {
    this.spaces = Array.isArray(initial?.spaces)
      ? initial.spaces.filter((x) => typeof x === "string")
      : [];
    this.tabs = {};
    if (initial?.tabs && typeof initial.tabs === "object" && !Array.isArray(initial.tabs)) {
      for (const [k, v] of Object.entries(initial.tabs)) {
        if (Array.isArray(v)) {
          this.tabs[k] = v.filter((x) => typeof x === "string");
        }
      }
    }
  }

  observe(spaces) {
    let changed = false;
    const nextSpaces = this.spaces.filter((id) => spaces.some((s) => s.id === id));
    if (!arraysEqual(this.spaces, nextSpaces)) {
      this.spaces = nextSpaces;
      changed = true;
    }
    for (const id of Object.keys(this.tabs)) {
      const space = spaces.find((s) => s.id === id);
      if (!space) {
        delete this.tabs[id];
        changed = true;
      } else {
        const filtered = this.tabs[id].filter((tid) => space.tabs.some((t) => t.id === tid));
        if (!arraysEqual(this.tabs[id], filtered)) {
          this.tabs[id] = filtered;
          changed = true;
        }
      }
    }
    const active = spaces.find((s) => s.active);
    if (!active) return changed;
    const updatedSpaces = [active.id, ...this.spaces.filter((id) => id !== active.id)];
    if (!arraysEqual(this.spaces, updatedSpaces)) {
      this.spaces = updatedSpaces;
      changed = true;
    }
    const tab = active.tabs.find((t) => t.active);
    if (tab) {
      const prevTabs = this.tabs[active.id] ?? [];
      const updatedTabs = [tab.id, ...prevTabs.filter((id) => id !== tab.id)];
      if (!arraysEqual(prevTabs, updatedTabs)) {
        this.tabs[active.id] = updatedTabs;
        changed = true;
      }
    }
    return changed;
  }

  target(kind, spaces) {
    this.observe(spaces);
    const active = spaces.find((s) => s.active);
    return (kind === "last_space" ? this.spaces[1] : this.tabs[active?.id]?.[1]) ?? null;
  }

  serialize() {
    return { spaces: this.spaces, tabs: this.tabs };
  }
}
