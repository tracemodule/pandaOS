// App-groepen in het app-menu (zoals mappen op een telefoon): zelf maken, hernoemen en verwijderen, bijv. "Google"
// met Gmail, Drive, Play Store, Foto's en Voice Search. Een app in een groep staat niet meer los in het menu.
// Apps worden bewaard als sleutel: id van een PandaOS-app ('spotify') of 'pkg:<pakketnaam>' voor een Android-app.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppGroup { id: string; name: string; apps: string[] }

interface AppGroupsState {
  groups: AppGroup[];
  addGroup: (name: string, apps?: string[]) => string;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void; // de apps komen weer los in het menu
  toggleApp: (id: string, app: string) => void; // in de groep zetten of eruit halen (een app zit in hoogstens één groep)
  setApps: (id: string, apps: string[]) => void;
}

export const useAppGroups = create<AppGroupsState>()(persist((set, get) => ({
  groups: [],
  addGroup: (name, apps = []) => {
    const id = Date.now().toString(36);
    set({ groups: [...get().groups.map((g) => ({ ...g, apps: g.apps.filter((a) => !apps.includes(a)) })), { id, name, apps }] });
    return id;
  },
  renameGroup: (id, name) => set({ groups: get().groups.map((g) => (g.id === id ? { ...g, name } : g)) }),
  removeGroup: (id) => set({ groups: get().groups.filter((g) => g.id !== id) }),
  toggleApp: (id, app) => set({
    groups: get().groups.map((g) => {
      if (g.id === id) return { ...g, apps: g.apps.includes(app) ? g.apps.filter((a) => a !== app) : [...g.apps, app] };
      return { ...g, apps: g.apps.filter((a) => a !== app) }; // uit een andere groep halen
    }),
  }),
  setApps: (id, apps) => set({
    groups: get().groups.map((g) => (g.id === id ? { ...g, apps } : { ...g, apps: g.apps.filter((a) => !apps.includes(a)) })),
  }),
}), { name: 'pandaos-app-groups' }));
