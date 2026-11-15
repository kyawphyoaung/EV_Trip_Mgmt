import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  gradient?: boolean;
}

export function Card({ children, className = '', gradient = false }: CardProps) {
  return (
    <div
      className={`
        rounded-2xl p-4
        ${gradient
          ? 'bg-gradient-to-br from-elevated via-surface to-base border border-primary/20'
          : 'bg-surface border border-elevated'}
        shadow-lg shadow-black/20
        ${className}
      `}
    >
      {children}
    </div>
  );
}
