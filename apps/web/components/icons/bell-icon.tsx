import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </svg>
  );
}
