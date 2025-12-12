import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  uiSize?: "sm" | "md";
};

export function Input({ className, uiSize = "md", ...props }: InputProps) {
  return <input className={cn("ui-input", `ui-input--${uiSize}`, className)} {...props} />;
}
