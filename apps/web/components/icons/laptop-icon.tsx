import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function LaptopIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M2.5 18.5h19" />
    </svg>
  );
}
