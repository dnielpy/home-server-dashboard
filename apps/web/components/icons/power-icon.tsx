import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function PowerIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M12 3v9" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}
