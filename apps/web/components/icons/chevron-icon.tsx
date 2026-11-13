import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
