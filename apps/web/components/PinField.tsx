'use client';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
};

/** Accepts the date as DDMMYYYY; separators are stripped. */
export default function PinField({ id, label, value, onChange, autoFocus }: Props) {
  return (
    <label htmlFor={id} className="hint" style={{ display: 'grid', gap: 6 }}>
      {label}
      <input
        id={id}
        className="pinin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="••••••••"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
      />
    </label>
  );
}
