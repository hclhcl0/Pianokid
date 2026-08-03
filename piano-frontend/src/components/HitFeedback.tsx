import React, { useEffect, useState } from 'react';
import { HitResult } from '../types';

export interface FeedbackData {
  id: string;
  x: number;
  y: number;
  result: HitResult;
  timestamp: number;
}

interface HitFeedbackProps {
  feedbacks: FeedbackData[];
}

export const HitFeedback: React.FC<HitFeedbackProps> = ({ feedbacks }) => {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      {feedbacks.map((fb) => (
        <FeedbackItem key={fb.id} feedback={fb} />
      ))}
    </div>
  );
};

const FeedbackItem: React.FC<{ feedback: FeedbackData }> = ({ feedback }) => {
  const { x, y, result } = feedback;
  
  let content = '';
  let color = '';
  let animation = '';

  if (result === 'perfect') {
    content = '✨ PERFECT!';
    color = '#FFD700';
    animation = 'floatUp 0.8s ease-out forwards';
  } else if (result === 'good') {
    content = '👍 GOOD!';
    color = '#00FFFF';
    animation = 'floatUp 0.8s ease-out forwards';
  } else {
    content = '💨 MISS';
    color = '#FF4444';
    animation = 'shake 0.4s ease-in-out forwards';
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        color,
        fontWeight: 'bold',
        fontSize: '24px',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        fontFamily: '"Fredoka One", cursive, sans-serif',
        animation,
        whiteSpace: 'nowrap',
      }}
    >
      {content}
    </div>
  );
};
