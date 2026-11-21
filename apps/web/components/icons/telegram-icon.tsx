import type { IconProps } from "@/components/icons/icon-props";

export function TelegramIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21 3-4 18-6-6-4 3v-7L21 3Z" />
      <path d="m21 3-18 7 4 1m4 4 10-12" />
    </svg>
  );
}
