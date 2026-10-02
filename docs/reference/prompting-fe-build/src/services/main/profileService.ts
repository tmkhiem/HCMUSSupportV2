import { appConfig } from '../../appConfig';
import { authorizedFetch } from './apiClient';
import type { ProfileOverviewDto } from '../../types';

export const mainProfileService = {
  getProfileOverview: async (): Promise<ProfileOverviewDto | null> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getProfileOverview`, { method: 'POST' });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },
  getGeneralInfo: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getGeneralInfo`, { method: 'POST' });
    return res.text();
  },
  getDetailedInfo: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getDetailedInfo`, { method: 'POST' });
    return res.text();
  },
  getSalaryProgress: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getSalaryProgress`, { method: 'POST' });
    return res.text();
  },
  getAwards: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getAwards`, { method: 'POST' });
    return res.text();
  },
  getPositionHistory: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getPositionHistory`, { method: 'POST' });
    return res.text();
  },
  getAcademicProgress: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getAcademicProgress`, { method: 'POST' });
    return res.text();
  },
  getTrainingProgress: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getTrainingProgress`, { method: 'POST' });
    return res.text();
  },
  getBusinessMissions: async (): Promise<string> => {
    const res = await authorizedFetch(`${appConfig.backendUrl}/api/profile/getBusinessMissions`, { method: 'POST' });
    return res.text();
  }
};