import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LEAPMOTOR_B10 } from '../config/vehicle';

interface SettingsState {
  electricityRateMmk: number;
  customRate: boolean;
  setElectricityRate: (rate: number, custom?: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      electricityRateMmk: LEAPMOTOR_B10.defaultElectricityRateMMK,
      customRate: false,
      setElectricityRate: (rate, custom = false) =>
        set({ electricityRateMmk: rate, customRate: custom }),
    }),
    { name: 'leapmotor-settings' },
  ),
);

export const RATE_PRESETS = [750, 1000, 2000, 2500] as const;
