import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function WrenchIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a4 4 0 0 1-2.2-2.2Z" />
      <path d="M14.7 6.3 17 4l3 3-2.3 2.3" />
    </svg>
  );
}
