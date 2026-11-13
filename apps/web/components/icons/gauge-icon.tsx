import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function GaugeIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M4.5 18a9 9 0 1 1 15 0" />
      <path d="m12 14 4-5" />
      <circle cx="12" cy="14" r="1.2" />
    </svg>
  );
}
