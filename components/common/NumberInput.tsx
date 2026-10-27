"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
  // Used when the field is left empty or invalid (e.g. 0 for prices, 1 for quantities)
  fallback?: number;
  integer?: boolean;
};

// Numeric field that keeps what the user types (no stuck leading "0", can be cleared while
// editing) and accepts "," as decimal separator. Reports a number on every change.
export function NumberInput({ value, onValueChange, fallback = 0, integer = false, onBlur, ...props }: NumberInputProps) {
  const format = (v: number) => (v === fallback && fallback === 0 ? "" : String(v));
  const [text, setText] = useState(format(value));

  // Follow outside changes (e.g. price filled in from a service)
  useEffect(() => {
    const parsed = parse(text);
    if (parsed !== value) setText(format(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function parse(raw: string) {
    const n = integer ? parseInt(raw, 10) : parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      placeholder={props.placeholder ?? (fallback === 0 ? "0" : String(fallback))}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(integer ? /[^\d]/g : /[^\d.,]/g, "");
        setText(raw);
        onValueChange(parse(raw));
      }}
      onBlur={(e) => {
        setText(format(parse(text)));
        onBlur?.(e);
      }}
    />
  );
}
