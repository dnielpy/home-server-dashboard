import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M10 9v6l5-3-5-3Z" />
    </svg>
  );
}
