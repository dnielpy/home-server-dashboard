import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function TrafficIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M8 4v15M4 15l4 4 4-4" />
      <path d="M16 20V5M12 9l4-4 4 4" />
    </svg>
  );
}
