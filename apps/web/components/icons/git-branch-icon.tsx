import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function GitBranchIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M6 7v10M18 9a6 6 0 0 1-6 6H6" />
    </svg>
  );
}
