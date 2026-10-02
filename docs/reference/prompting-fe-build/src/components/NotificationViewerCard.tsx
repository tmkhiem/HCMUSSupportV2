import React from 'react';
import type { NotificationDto } from '../types';
import { BaseViewerCard } from './BaseViewerCard';
import { theme } from '../theme';

interface NotificationViewerCardProps {
  notification: NotificationDto;
  isExiting: boolean;
  onClose: () => void;
}

export const NotificationViewerCard: React.FC<NotificationViewerCardProps> = ({ notification, isExiting, onClose }) => {
  return (
    <BaseViewerCard 
      title={notification.title}
      body={notification.renderedBody}
      id={notification.instanceId}
      date={notification.notificationDate}
      tags={notification.tags}
      icon={theme.icons.mapping.news}
      isExiting={isExiting}
      onClose={onClose}
    />
  );
}