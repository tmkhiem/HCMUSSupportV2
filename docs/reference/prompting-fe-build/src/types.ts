
export interface NotificationFilterRequest {
  cursor?: string | number;
  pageSize: number;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CursorPagedResult<T> {
  /** The data being returned for this specific chunk */
  items: T[];

  /** * The unique identifier (cursor) for the last item in this set.
   * Pass this as 'after' in your next request.
   */
  nextCursor: string | number | null;

  /** * Useful for the UI to know whether to show the 'Load More' button.
   */
  hasNextPage: boolean;

  /** * Optional: While Keyset pagination makes exact counts expensive,
   * you can still provide an estimate or the total if your DB allows.
   */
  totalCount?: number;

  /** * The number of items requested in this chunk.
   */
  pageSize: number;
}

export interface NotificationDto {
  instanceId: number;
  title: string;
  notificationDate: string;
  renderedBody: string;
  tags: string[];
}

export interface InitiativeDto {
  instanceId: number;
  title: string;
  renderedBody: string;
}

export interface TeachingDto {
  instanceId: string; // e.g. "Học kỳ 1 Năm học 2024-2025"
  title: string;
  content: string;
}

export interface ResearchTopicDto {
  instanceId: string;
  title: string;
  content: string;
}

export interface ResearchPaperDto {
  instanceId: string;
  title: string;
  content: string;
}

export interface UserDto {
  UserId: string;
  FullName: string;
  Emails: string;
  PpUrl: string | null | undefined;
  IsAdmin?: boolean | null | undefined;
}

export interface GroupDto {
  GroupName: string;
  UserCount: number;
}

export interface ProfileOverviewDto {
  user: {
    fullName: string;
    employeeId: string;
    department: string;
    position: string;
    email: string;
    phone: string;
  };
  general_information: {
    date_of_birth: string;
    gender: string;
    ethnicity: string;
    religion: string;
  };
  contact_details: {
    hometown: string;
    permanent_residence: string;
    id_number: string;
  };
  salary_history: string;
  commendations: string;
  position: {
    title: string;
    department_info: string;
  };
  educational_background: {
    degree: string;
    institution_and_year: string;
  };
  business_trips: {
    purpose: string;
    location_and_date: string;
  };
}

export const TabType = {
  PROFILE: 'Hồ sơ cá nhân',
  INITIATIVE: 'Sáng kiến',
  NEWS: 'Tin tức',
  TEACHING: 'Giảng dạy',
  RESEARCH: 'Nghiên cứu khoa học',
  ADMIN: 'Quản trị',
} as const;

export type TabType = (typeof TabType)[keyof typeof TabType];