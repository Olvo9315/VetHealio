import type { ChangeEvent } from "react";
import type { FieldPath, FieldValues, PathValue, UseFormReturn } from "react-hook-form";

// The inputs in components/ui are plain function components, and on React 18 they drop the `ref`
// that form.register() relies on: registered fields never showed their saved values (an edit
// dialog opened empty). This binds a field as a controlled input instead.
export function bindField<T extends FieldValues, N extends FieldPath<T>>(form: UseFormReturn<T>, name: N) {
  const value = form.watch(name);
  return {
    name,
    value: (value ?? "") as string | number,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      form.setValue(name, e.target.value as PathValue<T, N>, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      }),
  };
}
