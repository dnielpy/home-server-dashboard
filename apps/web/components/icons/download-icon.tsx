import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
