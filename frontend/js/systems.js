// FPV Systems Database and Management

const SYSTEM_TYPES = {
  VRX: {
    label: 'VRX (Goggle)',
    category: 'reception',
    hasVariants: false,
  },
  VTX: {
    label: 'VTX',
    category: 'transmission',
    hasVariants: false,
  },
  POWER: {
    label: 'Power',
    category: 'power',
    hasVariants: false,
  },
  CONTROL_LINK: {
    label: 'Control Link',
    category: 'control',
    hasVariants: true,
    variants: [
      { value: 'single', label: 'Single' },
      { value: 'diversity', label: 'Diversity' },
      { value: 'gemini', label: 'Gemini' },
    ],
  },
};

class SystemManager {
  constructor() {
    this.systems = this.loadSystems();
  }

  loadSystems() {
    const stored = localStorage.getItem('fpv_systems');
    return stored ? JSON.parse(stored) : {};
  }

  saveSystems() {
    localStorage.setItem('fpv_systems', JSON.stringify(this.systems));
  }

  getSystemsByType(type) {
    return Object.values(this.systems).filter(s => s.type === type);
  }

  addSystem(type, name, variant = null) {
    if (!SYSTEM_TYPES[type]) {
      throw new Error(`Invalid system type: ${type}`);
    }

    const id = `${type}_${Date.now()}`;
    this.systems[id] = {
      id,
      type,
      name,
      variant: variant || null,
      createdAt: new Date().toISOString(),
    };
    this.saveSystems();
    return this.systems[id];
  }

  getSystem(id) {
    return this.systems[id] || null;
  }

  getAllSystems() {
    return Object.values(this.systems);
  }

  deleteSystem(id) {
    delete this.systems[id];
    this.saveSystems();
  }

  formatSystemName(system) {
    const type = SYSTEM_TYPES[system.type];
    if (!type) return system.name;

    const variant = system.variant ? ` (${system.variant})` : '';
    return `${system.name}${variant}`;
  }
}

const systemManager = new SystemManager();
