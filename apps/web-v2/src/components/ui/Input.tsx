import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${props.className ?? ''}`.trim()} {...props} />;
}
