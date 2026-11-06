// Telefoon openen met een nummer in het toetsenblok, zonder te bellen (bijv. de SOS-knop in de bovenbalk).
// PhoneApp.tsx leest phoneDialPrefill bij openen, zet het nummer in het toetsenblok en maakt het veld weer leeg.
import { useUIStore } from '../store/uiStore';

export const openPhoneWithNumber = (number: string) => {
  const clean = (number || '').replace(/[^\d+*#]/g, '').slice(0, 20);
  const store = useUIStore.getState();
  store.openPhone();
  useUIStore.setState({ phoneDialPrefill: clean || null });
};
