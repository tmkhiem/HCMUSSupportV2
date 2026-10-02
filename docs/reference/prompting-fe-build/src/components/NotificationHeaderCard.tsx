import React from 'react';
import type { NotificationDto } from '../types';
import { BaseHeaderCard } from './BaseHeaderCard';

interface NotificationHeaderCardProps {
  notification: NotificationDto;
  onClick: () => void;
  index: number;
}

export const NotificationHeaderCard: React.FC<NotificationHeaderCardProps> = ({ notification, onClick, index }) => {
  const firstLine = notification.renderedBody.split('\n')[0];
  
  return (
    <BaseHeaderCard 
      title={notification.title}
      subtitle={firstLine}
      tags={notification.tags}
      date={notification.notificationDate}
      onClick={onClick}
      index={index}
    />
  );
};