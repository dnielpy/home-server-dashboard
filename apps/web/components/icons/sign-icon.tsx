import { type IconProps, outlineIconProps } from "@/components/icons/icon-props";

/** A sign held up on a stick: the messages Astro shows on /pet. */
export function SignIcon({ className }: IconProps) {
  return (
    <svg {...outlineIconProps} className={className} aria-hidden>
      <rect x="3" y="3.5" width="18" height="11" rx="2.5" />
      <path d="M12 14.5V21M7.5 8h9M7.5 11h6" />
    </svg>
  );
}
