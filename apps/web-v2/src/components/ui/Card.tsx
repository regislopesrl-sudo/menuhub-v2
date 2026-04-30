import type { HTMLAttributes, PropsWithChildren } from 'react';

export function Card({
  children,
  className,
  ...props
}: PropsWithChildren<{ className?: string } & HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`ui-card ${className ?? ''}`.trim()} {...props}>
      {children}
    </div>
  );
}
