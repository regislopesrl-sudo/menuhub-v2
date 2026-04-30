import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'danger';

export function Button({
  variant = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variantClass = variant === 'primary' ? 'ui-btn-primary' : variant === 'danger' ? 'ui-btn-danger' : '';
  return <button className={`ui-btn ${variantClass} ${className ?? ''}`.trim()} {...props} />;
}
