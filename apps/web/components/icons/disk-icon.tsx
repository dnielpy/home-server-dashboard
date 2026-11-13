import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function DiskIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M4 13 6.5 5.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13" />
      <rect x="4" y="13" width="16" height="7" rx="2" />
      <path d="M8 16.5h.01M12 16.5h4" />
    </svg>
  );
}
