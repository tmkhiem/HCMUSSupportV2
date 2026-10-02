
import { appConfig } from '../appConfig';

import { mockNotificationService } from './mock/mockNotificationService';
import { mockProfileService } from './mock/mockProfileService';
import { mockInitiativeService } from './mock/mockInitiativeService';
import { mockTeachingService } from './mock/mockTeachingService';
import { mockResearchService } from './mock/mockResearchService';
import { mockAdminService } from './mock/mockAdminService';
import { mockAuthService } from './mock/mockAuthService';

import { mainNotificationService } from './main/notificationService';
import { mainProfileService } from './main/profileService';
import { mainInitiativeService } from './main/initiativeService';
import { mainTeachingService } from './main/teachingService';
import { mainResearchService } from './main/researchService';
import { mainAdminService } from './main/adminService';
import { mainAuthService } from './main/authService';

// Export services that automatically switch implementations
export const notificationService = appConfig.useMock ? mockNotificationService : mainNotificationService;
export const profileService = appConfig.useMock ? mockProfileService : mainProfileService;
export const initiativeService = appConfig.useMock ? mockInitiativeService : mainInitiativeService;
export const teachingService = appConfig.useMock ? mockTeachingService : mainTeachingService;
export const researchService = appConfig.useMock ? mockResearchService : mainResearchService;
export const adminService = appConfig.useMock ? mockAdminService : mainAdminService;
export const authService = appConfig.useMock ? mockAuthService : mainAuthService;
