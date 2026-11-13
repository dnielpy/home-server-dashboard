import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function BoltIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M13 3 6 13h5l-1 8 7-10h-5l1-8Z" />
    </svg>
  );
}
